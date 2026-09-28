import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { withSignedUrls } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { ClientDocumentUploader } from "./client-document-uploader";
import { RequestedDocumentUploader } from "./requested-document-uploader";

type ClientDocument = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  status: string;
  organizer_id: string | null;
  document_request_id: string | null;
};

type DocumentRequest = {
  id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  received_at: string | null;
  reviewed_at: string | null;
};

export default async function ClientDocumentsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") notFound();

  const supabase = await createClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, firm_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (clientError || !client) {
    throw new Error("Unable to load your client record.");
  }

  const [
    { data, error },
    { data: requestData, error: requestError },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, file_name, storage_path, mime_type, size_bytes, created_at, status, organizer_id, document_request_id"
      )
      .neq("document_kind", "return_copy")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("document_requests")
      .select("id,title,details,due_date,status,created_at,received_at,reviewed_at")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const documents = await withSignedUrls(
    supabase,
    (data ?? []) as ClientDocument[],
    15 * 60
  );
  const requests = (requestData ?? []) as DocumentRequest[];
  const activeRequests = requests.filter((request) =>
    ["open", "received"].includes(request.status)
  );

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Secure files</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Documents
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Upload tax documents securely and review files you have already shared with
          your tax professional.
        </p>
      </section>

      {activeRequests.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
            <h2 className="font-semibold text-amber-950">Requested documents</h2>
            <p className="mt-1 text-sm text-amber-800">
              Your tax professional is waiting for {activeRequests.length} document request{activeRequests.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {activeRequests.map((request) => {
              const files = documents.filter(
                (document) => document.document_request_id === request.id
              );
              const isOpen = request.status === "open";
              const overdue =
                isOpen &&
                request.due_date &&
                request.due_date < new Date().toISOString().slice(0, 10);

              return (
                <div key={request.id} className="px-5 py-5">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={
                          "rounded-full px-2.5 py-1 text-xs font-semibold " +
                          (request.status === "received"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700")
                        }>
                          {request.status === "received" ? "Received · under review" : "Action needed"}
                        </span>
                        {overdue && (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            Past requested date
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 font-semibold text-slate-950">{request.title}</h3>
                      {request.details && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                          {request.details}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        {request.due_date
                          ? `Requested by ${new Date(request.due_date + "T00:00:00").toLocaleDateString()}`
                          : "No due date"}
                        {files.length > 0
                          ? ` · ${files.length} file${files.length === 1 ? "" : "s"} uploaded`
                          : ""}
                      </p>
                    </div>

                    <RequestedDocumentUploader
                      firmId={client.firm_id}
                      clientId={client.id}
                      requestId={request.id}
                      compact
                    />
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4 rounded-xl bg-slate-50">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {file.file_name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {new Date(file.created_at).toLocaleString()} · {file.status.replaceAll("_", " ")}
                            </p>
                          </div>
                          {file.url && (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-sm font-semibold text-blue-600"
                            >
                              Open
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {requestError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Requested documents could not be loaded.
        </p>
      )}

            <ClientDocumentUploader firmId={client.firm_id} clientId={client.id} />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Your documents could not be loaded.
        </p>
      )}

      {!error && documents.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="font-semibold text-slate-900">No uploaded documents yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Documents uploaded through an organizer or the uploader above will appear here.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Your uploaded files</h2>
            <p className="mt-1 text-sm text-slate-500">
              {documents.length} file{documents.length === 1 ? "" : "s"} available
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {document.file_name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {document.organizer_id
                      ? "Organizer upload"
                      : document.document_request_id
                        ? "Requested document"
                        : "General upload"}
                    {" · "}
                    {new Date(document.created_at).toLocaleString()}
                    {document.size_bytes
                      ? ` · ${(Number(document.size_bytes) / 1024 / 1024).toFixed(2)} MB`
                      : ""}
                  </p>
                </div>

                {document.url ? (
                  <a
                    href={document.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-sm text-slate-400">Secure link unavailable</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
