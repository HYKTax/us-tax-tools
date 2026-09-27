import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const [
    { count: activeClients },
    { count: waitingClients },
    { count: submittedOrganizers },
    { count: pendingDocuments },
    { data: recentOrganizers },
    { data: recentDocuments },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("organizers").select("id", { count: "exact", head: true }).in("status", ["sent", "in_progress"]),
    supabase.from("organizers").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase
      .from("organizers")
      .select("id, title, status, tax_year, updated_at, clients!organizers_client_firm_fk(primary_contact_name)")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("documents")
      .select("id, file_name, created_at, client_id, clients!documents_client_id_fkey(primary_contact_name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] || "there";

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Firm dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Good to see you, {firstName}.
          </h1>
          <p className="mt-2 text-slate-500">Here&apos;s what needs attention across your client work.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/clients/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
            Add client
          </Link>
          <Link href="/dashboard/templates" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Organizer templates
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active clients" value={activeClients ?? 0} helper="Clients with portal access" />
        <MetricCard label="Waiting on clients" value={waitingClients ?? 0} helper="Sent or in-progress organizers" />
        <MetricCard label="Ready for review" value={submittedOrganizers ?? 0} helper="Submitted organizers" />
        <MetricCard label="New documents" value={pendingDocuments ?? 0} helper="Documents pending review" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-950">Organizer activity</h2>
              <p className="mt-0.5 text-sm text-slate-500">Recent client workflow updates</p>
            </div>
            <Link href="/dashboard/clients" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View clients</Link>
          </div>
          {!recentOrganizers?.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No organizer activity yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentOrganizers.map((organizer) => {
                const client = organizer.clients as unknown as { primary_contact_name: string } | null;
                return (
                  <Link key={organizer.id} href={`/dashboard/organizers/${organizer.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{client?.primary_contact_name ?? "Client"}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{organizer.title} · {organizer.tax_year}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">
                      {statusLabel(organizer.status)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Recent documents</h2>
            <p className="mt-0.5 text-sm text-slate-500">Latest files received from clients</p>
          </div>
          {!recentDocuments?.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No documents uploaded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentDocuments.map((doc) => {
                const client = doc.clients as unknown as { primary_contact_name: string } | null;
                return (
                  <Link key={doc.id} href={`/dashboard/clients/${doc.client_id}`} className="block px-5 py-4 transition hover:bg-slate-50">
                    <p className="truncate text-sm font-medium text-slate-900">{doc.file_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {client?.primary_contact_name ?? "Client"} · {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950">Build your client workflow</h2>
          <p className="mt-1 text-sm text-slate-600">Add clients, create organizer templates, and send secure portal invitations.</p>
        </div>
        <Link href="/dashboard/clients" className="mt-4 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100 hover:bg-blue-50 sm:mt-0">
          Open clients
        </Link>
      </section>
    </div>
  );
}
