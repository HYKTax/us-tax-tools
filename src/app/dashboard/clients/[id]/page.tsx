import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteButton, SendOrganizerForm } from "./client-actions";

type OrganizerRow = {
  id: string;
  title: string;
  tax_year: number;
  status: string;
  sent_at: string | null;
};

function badge(status: string) {
  if (status === "active" || status === "reviewed") return "bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "bg-blue-50 text-blue-700";
  if (status === "sent" || status === "in_progress" || status === "invited") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, primary_contact_name, email, client_type, status")
    .eq("id", id)
    .single();

  if (!client) notFound();

  const [{ data: organizers }, { data: templates }, { data: documents }] = await Promise.all([
    supabase
      .from("organizers")
      .select("id, title, tax_year, status, sent_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("organizer_templates").select("id, name, tax_year").order("name"),
    supabase
      .from("documents")
      .select("id, file_name, status, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const organizerRows = (organizers ?? []) as OrganizerRow[];
  const pendingOrganizers = organizerRows.filter((o) => ["sent", "in_progress"].includes(o.status)).length;
  const submitted = organizerRows.filter((o) => o.status === "submitted").length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link href="/dashboard/clients" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← All clients</Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{client.primary_contact_name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge(client.status)}`}>{client.status}</span>
            </div>
            <p className="mt-2 text-slate-500">{client.email} · <span className="capitalize">{client.client_type}</span></p>
          </div>
          <InviteButton clientId={client.id} status={client.status} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Organizers</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{organizerRows.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Waiting on client</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{pendingOrganizers}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Ready for review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{submitted}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Organizers</h2>
            <p className="mt-1 text-sm text-slate-500">Questionnaires and document requests sent to this client.</p>
          </div>
          {!organizerRows.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No organizers sent yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {organizerRows.map((organizer) => (
                <Link key={organizer.id} href={`/dashboard/organizers/${organizer.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{organizer.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tax year {organizer.tax_year}{organizer.sent_at ? ` · Sent ${new Date(organizer.sent_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge(organizer.status)}`}>
                    {organizer.status.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Send an organizer</h2>
          <p className="mt-1 text-sm text-slate-500">Choose a reusable template and send it securely to this client.</p>
          <div className="mt-5">
            <SendOrganizerForm clientId={client.id} templates={templates ?? []} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Recent documents</h2>
          <p className="mt-1 text-sm text-slate-500">Latest files received through organizers and the client portal.</p>
        </div>
        {!documents?.length ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((document) => (
              <div key={document.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{document.file_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(document.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge(document.status)}`}>
                  {document.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
