import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ExportRow = {
  tax_year: number;
  return_type: string;
  status: string;
  priority: string;
  due_date: string | null;
  extension_status: string;
  efile_status: string;
  updated_at: string;
  clients: { primary_contact_name: string; email: string; client_type: string } | null;
  preparer: { full_name: string } | null;
  reviewer: { full_name: string } | null;
};

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET() {
  const profile = await getCurrentProfile();

  if (!profile || profile.role === "client" || !profile.is_active) {
    return new Response("Not authorized", { status: 403 });
  }

  const supabase = await createClient();
  const rows: ExportRow[] = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("tax_return_jobs")
      .select(
        "tax_year,return_type,status,priority,due_date,extension_status,efile_status,updated_at,clients(primary_contact_name,email,client_type),preparer:profiles!tax_return_jobs_preparer_id_fkey(full_name),reviewer:profiles!tax_return_jobs_reviewer_id_fkey(full_name)"
      )
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return new Response("Unable to export the work queue.", { status: 500 });
    }

    const batch = (data ?? []) as unknown as ExportRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;

    if (offset >= 10000) break;
  }

  const header = [
    "Client",
    "Email",
    "Client type",
    "Tax year",
    "Return type",
    "Status",
    "Priority",
    "Due date",
    "Preparer",
    "Reviewer",
    "Extension status",
    "E-file status",
    "Last updated",
  ];

  const csv = [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.clients?.primary_contact_name ?? "",
        row.clients?.email ?? "",
        row.clients?.client_type ?? "",
        row.tax_year,
        row.return_type,
        row.status,
        row.priority,
        row.due_date ?? "",
        row.preparer?.full_name ?? "",
        row.reviewer?.full_name ?? "",
        row.extension_status,
        row.efile_status,
        row.updated_at,
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-return-work-queue-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
