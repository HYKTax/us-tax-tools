import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ReturnDocument = {
  id: string;
  file_name: string;
  created_at: string;
  released_at: string | null;
};

export default async function ClientReturnsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("id, file_name, created_at, released_at")
    .eq("document_kind", "return_copy")
    .eq("client_visible", true)
    .order("released_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const documents = (data ?? []) as ReturnDocument[];

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Secure delivery</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Tax return documents
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Final return copies released by your tax professional appear here.
          Final return links are private, short-lived, and their portal access is recorded for delivery history.
        </p>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Your return documents could not be loaded.
        </p>
      )}

      {!error && documents.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No final return documents yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            When your tax professional releases a completed return copy, it will
            appear here automatically.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Available documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              {documents.length} released file{documents.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Final return copy
                    </span>
                  </div>
                  <p className="mt-2 truncate font-semibold text-slate-950">
                    {document.file_name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Released{" "}
                    {new Date(
                      document.released_at ?? document.created_at
                    ).toLocaleString()}
                  </p>
                </div>

                <Link
                  href={`/portal/returns/${document.id}/open`}
                  target="_blank"
                  className="w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Open PDF
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-slate-950">Keep a copy for your records</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Secure links expire after a short period. Open the document and save a
          copy to your own trusted device or records system if you need long-term
          access.
        </p>
      </section>
    </div>
  );
}
