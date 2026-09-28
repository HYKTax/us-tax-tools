import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ExtractionPreview = {
  status: string;
  document_type: string | null;
  tax_year: number | null;
  reviewed_at: string | null;
};

type ReturnPreview = {
  id: string;
  tax_year: number;
  return_type: string;
  status: string;
};

function documentStatusClasses(status: string) {
  if (status === "reviewed") return "bg-emerald-50 text-emerald-700";
  return "bg-amber-50 text-amber-700";
}

function extractionStatusClasses(status: string) {
  if (status === "completed") return "bg-blue-50 text-blue-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "unsupported") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

export default async function DocumentsPage() {
  const supabase = await createClient();

  const { data: documents, error } = await supabase
    .from("documents")
    .select(
      "id, client_id, tax_return_job_id, document_kind, client_visible, file_name, status, created_at, clients!documents_client_id_fkey(primary_contact_name), tax_return_job:tax_return_jobs(id,tax_year,return_type,status), document_extractions(status,document_type,tax_year,reviewed_at)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = documents ?? [];
  const sourceRows = rows.filter((doc) => doc.document_kind !== "return_copy");
  const returnCopies = rows.filter((doc) => doc.document_kind === "return_copy").length;
  const pendingReview = sourceRows.filter((doc) => doc.status === "pending_review").length;
  const extracted = sourceRows.filter((doc) => {
    const extraction = Array.isArray(doc.document_extractions)
      ? doc.document_extractions[0]
      : doc.document_extractions;
    return extraction?.status === "completed";
  }).length;
  const aiReviewed = sourceRows.filter((doc) => {
    const extraction = Array.isArray(doc.document_extractions)
      ? doc.document_extractions[0]
      : doc.document_extractions;
    return Boolean(extraction?.reviewed_at);
  }).length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Document center</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Documents</h1>
        <p className="mt-2 text-slate-500">
          Review source files, AI-extracted fields, and securely managed final return copies.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending document review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{pendingReview}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">AI extracted</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{extracted}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">AI data human-reviewed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{aiReviewed}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Final return copies</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{returnCopies}</p>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load documents: {error.message}
        </p>
      )}

      {!error && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No documents yet</h2>
          <p className="mt-2 text-sm text-slate-500">Client uploads will appear here automatically.</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Recent files</h2>
            <p className="mt-1 text-sm text-slate-500">
              Source documents support preparation; final return copies are controlled delivery artifacts.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">File</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Return</th>
                  <th className="px-5 py-3">Document</th>
                  <th className="px-5 py-3">AI extraction</th>
                  <th className="px-5 py-3">Uploaded</th>
                  <th className="px-5 py-3 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((doc) => {
                  const client = doc.clients as unknown as { primary_contact_name: string } | null;
                  const linkedReturn = doc.tax_return_job as unknown as ReturnPreview | null;
                  const extractionRaw = doc.document_extractions as unknown;
                  const extraction = (
                    Array.isArray(extractionRaw) ? extractionRaw[0] : extractionRaw
                  ) as ExtractionPreview | null | undefined;

                  return (
                    <tr key={doc.id} className="transition hover:bg-slate-50">
                      <td className="max-w-xs px-5 py-4">
                        <Link href={`/dashboard/documents/${doc.id}`} className="block truncate font-semibold text-slate-900 hover:text-blue-600">
                          {doc.file_name}
                        </Link>
                        {doc.document_kind === "return_copy" ? (
                          <p className="mt-1 text-xs font-medium text-blue-600">
                            Final return copy · {doc.client_visible ? "Released" : "Private"}
                          </p>
                        ) : extraction?.document_type ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {extraction.document_type}
                            {extraction.tax_year ? ` · ${extraction.tax_year}` : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/clients/${doc.client_id}`} className="font-medium text-blue-600 hover:text-blue-700">
                          {client?.primary_contact_name ?? "Client"}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {linkedReturn ? (
                          <Link href={`/dashboard/work/${linkedReturn.id}`} className="font-medium text-slate-800 hover:text-blue-600">
                            {linkedReturn.tax_year} {linkedReturn.return_type}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Not linked</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${documentStatusClasses(doc.status)}`}>
                          {doc.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {doc.document_kind === "return_copy" ? (
                          <span className="text-xs font-medium text-slate-400">Not applicable</span>
                        ) : !extraction ? (
                          <span className="text-xs text-slate-400">Not extracted</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${extractionStatusClasses(extraction.status)}`}>
                              {extraction.status}
                            </span>
                            {extraction.reviewed_at && (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                Reviewed
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/dashboard/documents/${doc.id}`} className="font-semibold text-blue-600 hover:text-blue-700">
                          {doc.document_kind === "return_copy" ? "Open →" : "Review →"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
