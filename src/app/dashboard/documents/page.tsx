import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/documents";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const { data: rawDocuments, error } = await supabase
    .from("documents")
    .select("id, client_id, file_name, storage_path, status, created_at, clients!documents_client_id_fkey(primary_contact_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const documents = await withSignedUrls(supabase, rawDocuments ?? []);

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Document center</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Documents</h1>
        <p className="mt-2 text-slate-500">Review recently uploaded client files across your firm.</p>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load documents: {error.message}
        </p>
      )}

      {!error && documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No documents yet</h2>
          <p className="mt-2 text-sm text-slate-500">Client uploads will appear here automatically.</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Recent files</h2>
            <p className="mt-1 text-sm text-slate-500">Up to the latest 100 documents visible to your firm.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">File</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Uploaded</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => {
                  const client = doc.clients as unknown as { primary_contact_name: string } | null;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="max-w-sm truncate px-5 py-4 font-medium text-slate-900">{doc.file_name}</td>
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/clients/${doc.client_id}`} className="font-medium text-blue-600 hover:text-blue-700">
                          {client?.primary_contact_name ?? "Client"}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold capitalize text-amber-700">
                          {doc.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-4 text-right">
                        {doc.url ? (
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:text-blue-700">
                            Open ↗
                          </a>
                        ) : (
                          <span className="text-slate-400">Unavailable</span>
                        )}
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
