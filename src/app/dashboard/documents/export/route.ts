import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ExportRow = {
  id: string;
  client_id: string;
  tax_return_job_id: string | null;
  document_request_id: string | null;
  document_kind: string;
  client_visible: boolean;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  created_at: string;
  clients: { primary_contact_name: string; email: string } | null;
  tax_return_job: {
    tax_year: number;
    return_type: string;
    status: string;
  } | null;
  request: {
    title: string;
    status: string;
  } | null;
  extraction: Array<{
    status: string;
    document_type: string | null;
    tax_year: number | null;
    reviewed_at: string | null;
  }> | null;
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

  while (offset < 10000) {
    const { data, error } = await supabase
      .from("documents")
      .select(
        "id,client_id,tax_return_job_id,document_request_id,document_kind,client_visible,file_name,mime_type,size_bytes,status,created_at,clients!documents_client_id_fkey(primary_contact_name,email),tax_return_job:tax_return_jobs(tax_year,return_type,status),request:document_requests!documents_document_request_id_fkey(title,status),extraction:document_extractions(status,document_type,tax_year,reviewed_at)"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return new Response("Unable to export documents.", { status: 500 });
    }

    rows.push(...((data ?? []) as unknown as ExportRow[]));
    if ((data ?? []).length < pageSize) break;
    offset += pageSize;
  }

  const csv = [
    [
      "Client",
      "Client email",
      "File",
      "Document kind",
      "Review status",
      "Client visible",
      "Return",
      "Return status",
      "Document request",
      "Request status",
      "AI status",
      "AI document type",
      "AI tax year",
      "AI reviewed",
      "MIME type",
      "Size bytes",
      "Uploaded",
    ]
      .map(csvCell)
      .join(","),
    ...rows.map((row) => {
      const extraction = Array.isArray(row.extraction) ? row.extraction[0] : null;
      return [
        row.clients?.primary_contact_name ?? "",
        row.clients?.email ?? "",
        row.file_name,
        row.document_kind,
        row.status,
        row.client_visible ? "yes" : "no",
        row.tax_return_job
          ? `${row.tax_return_job.tax_year} ${row.tax_return_job.return_type}`
          : "",
        row.tax_return_job?.status ?? "",
        row.request?.title ?? "",
        row.request?.status ?? "",
        extraction?.status ?? "",
        extraction?.document_type ?? "",
        extraction?.tax_year ?? "",
        extraction?.reviewed_at ?? "",
        row.mime_type ?? "",
        row.size_bytes ?? "",
        row.created_at,
      ]
        .map(csvCell)
        .join(",");
    }),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-documents-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
