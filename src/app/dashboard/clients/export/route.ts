import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ClientExportRow = {
  primary_contact_name: string;
  email: string;
  client_type: string;
  status: string;
  created_at: string;
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
  const rows: ClientExportRow[] = [];
  const pageSize = 500;
  let offset = 0;

  while (offset < 10000) {
    const { data, error } = await supabase
      .from("clients")
      .select("primary_contact_name,email,client_type,status,created_at")
      .order("primary_contact_name")
      .range(offset, offset + pageSize - 1);

    if (error) return new Response("Unable to export clients.", { status: 500 });

    const batch = (data ?? []) as ClientExportRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const csv = [
    ["Client", "Email", "Client type", "Portal status", "Created"].map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.primary_contact_name,
        row.email,
        row.client_type,
        row.status,
        row.created_at,
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-clients-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
