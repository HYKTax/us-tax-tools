import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/documents";
import { DocumentReviewActions } from "../document-review-actions";

type ExtractedField = {
  name: string;
  label: string;
  value: string;
  confidence: number;
};

function statusClasses(status: string) {
  if (status === "completed" || status === "reviewed") return "bg-emerald-50 text-emerald-700";
  if (status === "pending" || status === "pending_review") return "bg-amber-50 text-amber-700";
  if (status === "failed" || status === "rejected") return "bg-red-50 text-red-700";
  if (status === "unsupported") return "bg-slate-100 text-slate-600";
  return "bg-blue-50 text-blue-700";
}

function confidenceLabel(value: number | null) {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: document, error } = await supabase
    .from("documents")
    .select(
      "id, firm_id, client_id, organizer_id, tax_return_job_id, file_name, storage_path, mime_type, size_bytes, status, created_at, clients!documents_client_id_fkey(primary_contact_name, email), organizer:organizers(id,title,status), tax_return_job:tax_return_jobs(id,tax_year,return_type,status)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load this document.");
  if (!document) notFound();

  const [{ data: extraction }, { data: returnJobs }] = await Promise.all([
    supabase
      .from("document_extractions")
      .select(
        "id, status, document_type, tax_year, fields, flags, summary, error_message, reviewed_by, reviewed_at, provider, model, confidence, started_at, completed_at, created_at, updated_at"
      )
      .eq("document_id", id)
      .maybeSingle(),
    supabase
      .from("tax_return_jobs")
      .select("id, tax_year, return_type, status")
      .eq("client_id", document.client_id)
      .order("tax_year", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const [signedDocument] = await withSignedUrls(supabase, [document], 20 * 60);
  const client = document.clients as unknown as { primary_contact_name: string; email: string } | null;
  const organizer = document.organizer as unknown as { id: string; title: string; status: string } | null;
  const linkedReturn = document.tax_return_job as unknown as {
    id: string;
    tax_year: number;
    return_type: string;
    status: string;
  } | null;

  const fields = Array.isArray(extraction?.fields) ? (extraction.fields as ExtractedField[]) : [];
  const flags = Array.isArray(extraction?.flags) ? (extraction.flags as string[]) : [];
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY);

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link href="/dashboard/documents" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          ← Documents
        </Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-600">Document review</p>
            <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight text-slate-950">{document.file_name}</h1>
            <p className="mt-2 text-slate-500">
              {client?.primary_contact_name ?? "Client"} · Uploaded {new Date(document.created_at).toLocaleDateString()}
            </p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${statusClasses(document.status)}`}>
            {document.status.replaceAll("_", " ")}
          </span>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h2 className="font-semibold text-slate-950">Source document</h2>
                <p className="mt-1 text-sm text-slate-500">Always verify AI-extracted values against the original document.</p>
              </div>
              {signedDocument.url ? (
                <a
                  href={signedDocument.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open original ↗
                </a>
              ) : (
                <span className="text-sm text-slate-400">Preview unavailable</span>
              )}
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">File type</dt>
                <dd className="mt-1 font-medium text-slate-900">{document.mime_type || "Unknown"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Size</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {document.size_bytes ? `${(Number(document.size_bytes) / 1024 / 1024).toFixed(2)} MB` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Client</dt>
                <dd className="mt-1 font-medium text-slate-900">{client?.primary_contact_name ?? "Client"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Linked return</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {linkedReturn ? `${linkedReturn.tax_year} ${linkedReturn.return_type}` : "Not linked"}
                </dd>
              </div>
            </dl>

            {organizer && (
              <Link
                href={`/dashboard/organizers/${organizer.id}`}
                className="mt-5 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Open linked organizer: {organizer.title} →
              </Link>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-semibold text-slate-950">AI extraction</h2>
                <p className="mt-1 text-sm text-slate-500">Structured source-document data for staff verification.</p>
              </div>
              {extraction && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(extraction.status)}`}>
                    {extraction.status}
                  </span>
                  {extraction.reviewed_at && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Human reviewed
                    </span>
                  )}
                </div>
              )}
            </div>

            {!extraction ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-800">No AI extraction yet</p>
                <p className="mt-1 text-sm text-slate-500">Use the review controls to extract this document when the AI provider is configured.</p>
              </div>
            ) : extraction.status === "failed" || extraction.status === "unsupported" ? (
              <div className="px-5 py-6">
                <p className="text-sm font-semibold text-red-700">
                  {extraction.status === "unsupported" ? "Unsupported document" : "Extraction failed"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{extraction.error_message || "No error details were recorded."}</p>
              </div>
            ) : extraction.status === "pending" ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-800">Extraction is processing</p>
                <p className="mt-1 text-sm text-slate-500">This page will show the structured fields after processing completes.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 border-b border-slate-100 px-5 py-5 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Document type</p>
                    <p className="mt-1 font-semibold text-slate-900">{extraction.document_type || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Tax year</p>
                    <p className="mt-1 font-semibold text-slate-900">{extraction.tax_year ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">AI confidence</p>
                    <p className="mt-1 font-semibold text-slate-900">{confidenceLabel(extraction.confidence)}</p>
                  </div>
                </div>

                {extraction.summary && (
                  <div className="border-b border-slate-100 px-5 py-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Summary</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{extraction.summary}</p>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Field</th>
                        <th className="px-5 py-3">Value</th>
                        <th className="px-5 py-3 text-right">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fields.length ? fields.map((field, index) => (
                        <tr key={`${field.name}-${index}`}>
                          <td className="px-5 py-4">
                            <p className="font-medium text-slate-900">{field.label}</p>
                            <p className="mt-1 text-xs text-slate-400">{field.name}</p>
                          </td>
                          <td className="px-5 py-4 font-mono text-slate-700">{field.value}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{confidenceLabel(field.confidence)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={3} className="px-5 py-8 text-center text-slate-500">No structured fields extracted.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {flags.length > 0 && (
                  <div className="border-t border-slate-100 bg-amber-50/50 px-5 py-5">
                    <p className="text-sm font-semibold text-amber-900">Review flags</p>
                    <ul className="mt-2 space-y-1 text-sm text-amber-800">
                      {flags.map((flag, index) => <li key={index}>• {flag}</li>)}
                    </ul>
                  </div>
                )}

                <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
                  {extraction.provider ? `Provider: ${extraction.provider}` : "AI provider not recorded"}
                  {extraction.model ? ` · Model: ${extraction.model}` : ""}
                  {extraction.completed_at ? ` · Completed ${new Date(extraction.completed_at).toLocaleString()}` : ""}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Review controls</h2>
            <p className="mt-1 text-sm text-slate-500">Link, extract, verify, and complete document review.</p>
            <div className="mt-5">
              <DocumentReviewActions
                documentId={document.id}
                currentReturnJobId={document.tax_return_job_id}
                returnJobs={returnJobs ?? []}
                documentReviewed={document.status === "reviewed"}
                extractionCompleted={extraction?.status === "completed"}
                extractionReviewed={Boolean(extraction?.reviewed_at)}
                aiConfigured={aiConfigured}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <h2 className="font-semibold text-slate-950">Human-review rule</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              AI output is treated as draft source-document data. Staff should compare each material value to the original file before using it in preparation or marking the document reviewed.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
