import Link from "next/link";
import { redirect } from "next/navigation";
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
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const dueSoonDate = new Date();
  dueSoonDate.setUTCDate(dueSoonDate.getUTCDate() + 7);
  const dueSoon = dueSoonDate.toISOString().slice(0, 10);

  const [
    { count: myPreparation },
    { count: myReviews },
    { count: overdueReturns },
    { count: dueSoonReturns },
    { count: activeClients },
    { count: waitingReturns },
    { count: reviewReturns },
    { count: pendingDocuments },
    { data: recentReturns },
    { data: recentDocuments },
  ] = await Promise.all([
    supabase
      .from("tax_return_jobs")
      .select("id", { count: "exact", head: true })
      .eq("preparer_id", profile.id)
      .not("status", "in", '("review","ready_to_file","e_filed","accepted","completed")'),
    supabase
      .from("tax_return_reviews")
      .select("id", { count: "exact", head: true })
      .eq("assigned_reviewer_id", profile.id)
      .eq("status", "requested"),
    supabase
      .from("tax_return_jobs")
      .select("id", { count: "exact", head: true })
      .lt("due_date", today)
      .not("status", "in", '("accepted","completed")'),
    supabase
      .from("tax_return_jobs")
      .select("id", { count: "exact", head: true })
      .gte("due_date", today)
      .lte("due_date", dueSoon)
      .not("status", "in", '("accepted","completed")'),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("tax_return_jobs").select("id", { count: "exact", head: true }).eq("status", "waiting_on_client"),
    supabase.from("tax_return_jobs").select("id", { count: "exact", head: true }).eq("status", "review"),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase
      .from("tax_return_jobs")
      .select("id, client_id, tax_year, return_type, status, priority, due_date, updated_at, clients(primary_contact_name)")
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
          <p className="mt-2 text-slate-500">Here&apos;s what needs attention across your tax-return workflow.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/clients/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
            Add client
          </Link>
          <Link href="/dashboard/work" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Open work queue
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-semibold text-slate-950">Deadline watch</h2>
          <p className="mt-1 text-sm text-slate-500">Open returns that need date-driven attention.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard/work"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm transition hover:bg-red-100/70"
          >
            <p className="text-sm font-semibold text-red-700">Overdue</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-red-950">{overdueReturns ?? 0}</p>
            <p className="mt-1 text-xs text-red-700">Open returns past their target due date</p>
          </Link>
          <Link
            href="/dashboard/work"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:bg-amber-100/70"
          >
            <p className="text-sm font-semibold text-amber-700">Due in 7 days</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-950">{dueSoonReturns ?? 0}</p>
            <p className="mt-1 text-xs text-amber-700">Open returns approaching their target due date</p>
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-semibold text-slate-950">My workload</h2>
          <p className="mt-1 text-sm text-slate-500">Assignments currently owned by you.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/dashboard/work" className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm transition hover:bg-blue-100/70">
            <p className="text-sm font-semibold text-blue-700">Preparation assignments</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-blue-950">{myPreparation ?? 0}</p>
            <p className="mt-1 text-xs text-blue-700">Returns assigned to you before final review</p>
          </Link>
          <Link href="/dashboard/work" className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm transition hover:bg-violet-100/70">
            <p className="text-sm font-semibold text-violet-700">Review assignments</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-violet-950">{myReviews ?? 0}</p>
            <p className="mt-1 text-xs text-violet-700">Formal return reviews waiting for your sign-off</p>
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-semibold text-slate-950">Firm overview</h2>
          <p className="mt-1 text-sm text-slate-500">Workload and client activity across the firm.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active clients" value={activeClients ?? 0} helper="Clients with active portal records" />
        <MetricCard label="Waiting on clients" value={waitingReturns ?? 0} helper="Returns blocked by client action" />
        <MetricCard label="In review" value={reviewReturns ?? 0} helper="Returns awaiting reviewer action" />
        <MetricCard label="New documents" value={pendingDocuments ?? 0} helper="Documents pending staff review" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-950">Recent return activity</h2>
              <p className="mt-0.5 text-sm text-slate-500">Latest preparation, review, and filing work</p>
            </div>
            <Link href="/dashboard/work" className="text-sm font-semibold text-blue-600 hover:text-blue-700">View work queue</Link>
          </div>
          {!recentReturns?.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No tax returns created yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentReturns.map((job) => {
                const client = job.clients as unknown as { primary_contact_name: string } | null;
                return (
                  <Link key={job.id} href={`/dashboard/work/${job.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{client?.primary_contact_name ?? "Client"}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {job.tax_year} {job.return_type}
                        {job.due_date ? ` · Due ${new Date(job.due_date + "T00:00:00").toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">
                      {statusLabel(job.status)}
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
          <h2 className="font-semibold text-slate-950">Run the tax workflow from one place</h2>
          <p className="mt-1 text-sm text-slate-600">Create returns from client profiles, assign preparers/reviewers, and track filing through acceptance.</p>
        </div>
        <Link href="/dashboard/work" className="mt-4 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100 hover:bg-blue-50 sm:mt-0">
          Open Work / Returns
        </Link>
      </section>
    </div>
  );
}
