import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type AuditExportRow = {
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { full_name: string; email: string } | null;
};

function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasStaffPermission(profile, "audit.view")) {
    return new Response("Not authorized", { status: 403 });
  }

  const supabase = await createClient();
  const rows: AuditExportRow[] = [];
  const pageSize = 500;
  let offset = 0;

  while (offset < 10000) {
    const { data, error } = await supabase
      .from("audit_log")
      .select(
        "action,target_type,target_id,metadata,created_at,actor:profiles!audit_log_actor_id_fkey(full_name,email)"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return new Response("Unable to export activity.", { status: 500 });
    }

    const batch = (data ?? []) as unknown as AuditExportRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const csv = [
    ["Timestamp UTC", "Actor", "Actor email", "Action", "Target type", "Target ID", "Metadata"]
      .map(csvCell)
      .join(","),
    ...rows.map((row) =>
      [
        row.created_at,
        row.actor?.full_name ?? "",
        row.actor?.email ?? "",
        row.action,
        row.target_type ?? "",
        row.target_id ?? "",
        row.metadata ?? "",
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="firm-audit-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
