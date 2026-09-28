import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

type OrganizerRow = {
  id: string;
  title: string;
  tax_year: number;
  status: string;
};

function progressFor(status: string) {
  if (status === "reviewed") return 100;
  if (status === "submitted") return 90;
  if (status === "in_progress") return 55;
  if (status === "sent") return 15;
  return 0;
}

function actionText(status: string) {
  if (status === "in_progress") return "Continue organizer";
  if (status === "sent") return "Start organizer";
  if (status === "submitted") return "View submission";
  if (status === "reviewed") return "View organizer";
  return "Open organizer";
}

export default async function PortalPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [
    { data: organizers, error },
    { data: documents },
    { count: releasedReturnCount },
  ] = await Promise.all([
    supabase.from("organizers").select("id, title, tax_year, status").order("tax_year", { ascending: false }),
    supabase.from("documents").select("id, file_name, created_at").order("created_at", { ascending: false }).limit(5),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("document_kind", "return_copy")
      .eq("client_visible", true),
  ]);

  const rows = (organizers ?? []) as OrganizerRow[];
  const openItems = rows.filter((row) => ["sent", "in_progress"].includes(row.status));
  const firstName = profile?.full_name?.split(" ")[0] || "there";

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm font-semibold text-blue-600">Your secure client portal</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Welcome, {firstName}.</h1>
        <p className="mt-2 text-slate-500">
          {openItems.length > 0
            ? `You have ${openItems.length} item${openItems.length === 1 ? "" : "s"} that need your attention.`
            : "You’re all caught up. We’ll show new requests here when your tax professional sends them."}
        </p>
      </section>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Couldn&apos;t load your organizers: {error.message}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/portal/status"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
        >
          <p className="text-sm font-semibold text-blue-600">Return status</p>
          <h2 className="mt-2 font-semibold text-slate-950">Track your tax return</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            See preparation, review, filing, and acceptance progress.
          </p>
        </Link>
        <Link
          href="/portal/documents"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
        >
          <p className="text-sm font-semibold text-blue-600">Documents</p>
          <h2 className="mt-2 font-semibold text-slate-950">Upload secure files</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Send additional PDFs or tax-document images securely.
          </p>
        </Link>
        <Link
          href="/portal/returns"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
        >
          <p className="text-sm font-semibold text-blue-600">Final returns</p>
          <h2 className="mt-2 font-semibold text-slate-950">Download released copies</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Access final return PDFs released by your tax professional.
          </p>
        </Link>
      </section>

      {(releasedReturnCount ?? 0) > 0 && (
        <Link
          href="/portal/returns"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm transition hover:border-emerald-300"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Secure delivery
              </span>
              <h2 className="mt-3 text-lg font-semibold text-emerald-950">
                Final tax return document{(releasedReturnCount ?? 0) === 1 ? "" : "s"} available
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                {(releasedReturnCount ?? 0)} released file{(releasedReturnCount ?? 0) === 1 ? "" : "s"} ready in your portal.
              </p>
            </div>
            <span className="text-sm font-semibold text-emerald-700">
              Open Returns →
            </span>
          </div>
        </Link>
      )}

      {openItems.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          {openItems.map((organizer) => {
            const progress = progressFor(organizer.status);
            return (
              <Link key={organizer.id} href={`/portal/organizers/${organizer.id}`} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold capitalize text-amber-700">
                      Action needed
                    </span>
                    <h2 className="mt-4 text-lg font-semibold text-slate-950">{organizer.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">Tax year {organizer.tax_year}</p>
                  </div>
                  <span className="text-sm font-semibold text-blue-600">{actionText(organizer.status)} →</span>
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="capitalize">{organizer.status.replace("_", " ")}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Your organizers</h2>
            <p className="mt-1 text-sm text-slate-500">Tax questionnaires and document requests from your firm</p>
          </div>
          {!rows.length && !error ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing here yet. Your organizer will appear once your firm sends one.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((organizer) => (
                <Link key={organizer.id} href={`/portal/organizers/${organizer.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{organizer.title}</p>
                    <p className="mt-1 text-xs text-slate-500">Tax year {organizer.tax_year}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
                    {organizer.status.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Recent documents</h2>
            <p className="mt-1 text-sm text-slate-500">Files recently shared through your portal</p>
          </div>
          {!documents?.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No documents uploaded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {documents.map((document) => (
                <div key={document.id} className="px-5 py-4">
                  <p className="truncate text-sm font-medium text-slate-900">{document.file_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(document.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
