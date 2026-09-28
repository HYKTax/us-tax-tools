import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type ReturnRow = {
  id: string;
  status: string;
  return_type: string;
  tax_year: number;
  due_date: string | null;
  priority: string;
  preparer_id: string | null;
  reviewer_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type OrganizerRow = {
  status: string;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
};

type DocumentRow = {
  status: string;
  document_kind: string;
  created_at: string;
};

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function AnalyticsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "audit.view")) notFound();

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: returnData, error: returnsError },
    { data: organizerData, error: organizersError },
    { data: documentData, error: documentsError },
    { count: activeClients },
    { count: openTasks },
    { count: overdueTasks },
  ] = await Promise.all([
    supabase
      .from("tax_return_jobs")
      .select(
        "id,status,return_type,tax_year,due_date,priority,preparer_id,reviewer_id,created_at,updated_at,completed_at"
      )
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase
      .from("organizers")
      .select("status,created_at,submitted_at,reviewed_at")
      .limit(5000),
    supabase
      .from("documents")
      .select("status,document_kind,created_at")
      .limit(5000),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("staff_tasks")
      .select("id", { count: "exact", head: true })
      .neq("status", "done"),
    supabase
      .from("staff_tasks")
      .select("id", { count: "exact", head: true })
      .neq("status", "done")
      .lt("due_date", today),
  ]);

  const returns = (returnData ?? []) as ReturnRow[];
  const organizers = (organizerData ?? []) as OrganizerRow[];
  const documents = (documentData ?? []) as DocumentRow[];

  const activeReturns = returns.filter(
    (row) => !["accepted", "completed"].includes(row.status)
  );
  const completedReturns = returns.filter((row) =>
    ["accepted", "completed"].includes(row.status)
  );
  const overdueReturns = activeReturns.filter(
    (row) => row.due_date && row.due_date < today
  );
  const unassignedPreparation = activeReturns.filter(
    (row) => !row.preparer_id
  ).length;
  const unassignedReview = activeReturns.filter(
    (row) =>
      ["review", "ready_to_file", "e_filed"].includes(row.status) &&
      !row.reviewer_id
  ).length;

  const submittedOrganizers = organizers.filter((row) =>
    ["submitted", "reviewed"].includes(row.status)
  ).length;
  const reviewedOrganizers = organizers.filter(
    (row) => row.status === "reviewed"
  ).length;
  const organizerCompletionRate = pct(submittedOrganizers, organizers.length);
  const organizerReviewRate = pct(reviewedOrganizers, submittedOrganizers);

  const pendingDocs = documents.filter(
    (row) => row.status === "pending_review"
  ).length;
  const returnCopies = documents.filter(
    (row) => row.document_kind === "return_copy"
  ).length;

  const statusOrder = [
    "waiting_on_client",
    "ready_to_prepare",
    "preparing",
    "review",
    "waiting_on_signature",
    "ready_to_file",
    "e_filed",
    "rejected",
    "extended",
    "accepted",
    "completed",
  ];

  const statusCounts = statusOrder.map((status) => ({
    status,
    count: returns.filter((row) => row.status === status).length,
  }));
  const largestStatus = Math.max(1, ...statusCounts.map((row) => row.count));

  const returnTypeCounts = Array.from(
    new Set(returns.map((row) => row.return_type))
  )
    .map((returnType) => ({
      returnType,
      count: returns.filter((row) => row.return_type === returnType).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const largestType = Math.max(1, ...returnTypeCounts.map((row) => row.count));

  const taxYears = Array.from(new Set(returns.map((row) => row.tax_year))).sort(
    (a, b) => b - a
  );
  const latestTaxYear = taxYears[0] ?? null;
  const latestYearReturns = latestTaxYear
    ? returns.filter((row) => row.tax_year === latestTaxYear)
    : [];
  const latestYearCompleted = latestYearReturns.filter((row) =>
    ["accepted", "completed"].includes(row.status)
  ).length;

  const dataError = returnsError || organizersError || documentsError;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Management reporting</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Firm analytics
          </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            A live operational view of return pipeline health, client workload, organizers,
            documents, and internal follow-up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/workload"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Team workload
          </Link>
          <Link
            href="/dashboard/activity"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Audit activity
          </Link>
        </div>
      </section>

      {dataError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Some analytics could not be loaded. The figures below may be incomplete.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active clients</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{activeClients ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">Current portal client records</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">Open returns</p>
          <p className="mt-2 text-3xl font-semibold text-blue-950">{activeReturns.length}</p>
          <p className="mt-1 text-xs text-blue-700">
            {returns.length ? pct(activeReturns.length, returns.length) : 0}% of all loaded returns
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Completed / accepted</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">{completedReturns.length}</p>
          <p className="mt-1 text-xs text-emerald-700">
            {returns.length ? pct(completedReturns.length, returns.length) : 0}% completion across loaded returns
          </p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Overdue returns</p>
          <p className="mt-2 text-3xl font-semibold text-red-950">{overdueReturns.length}</p>
          <p className="mt-1 text-xs text-red-700">Open jobs past their target due date</p>
        </div>
      </section>

      {latestTaxYear && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-950">{latestTaxYear} tax-year progress</p>
              <p className="mt-1 text-sm text-slate-500">
                {latestYearCompleted} of {latestYearReturns.length} returns accepted or completed
              </p>
            </div>
            <p className="text-2xl font-semibold text-slate-950">
              {pct(latestYearCompleted, latestYearReturns.length)}%
            </p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${pct(latestYearCompleted, latestYearReturns.length)}%` }}
            />
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Return pipeline</h2>
          <p className="mt-1 text-sm text-slate-500">
            Where firm work currently sits across preparation, review, and filing.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {statusCounts.map((row) => (
              <div key={row.status}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                  <span className="capitalize text-slate-700">{label(row.status)}</span>
                  <span className="font-semibold text-slate-900">{row.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.round((row.count / largestStatus) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Return mix</h2>
          <p className="mt-1 text-sm text-slate-500">
            Most common return types across the firm.
          </p>
          {returnTypeCounts.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No return data yet.</p>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              {returnTypeCounts.map((row) => (
                <div key={row.returnType}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{row.returnType}</span>
                    <span className="font-semibold text-slate-900">{row.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-700"
                      style={{ width: `${Math.round((row.count / largestType) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/dashboard/organizers"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
        >
          <p className="text-sm text-slate-500">Organizer completion</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{organizerCompletionRate}%</p>
          <p className="mt-1 text-xs text-slate-500">
            {submittedOrganizers} of {organizers.length} submitted or reviewed
          </p>
        </Link>
        <Link
          href="/dashboard/organizers"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
        >
          <p className="text-sm text-slate-500">Organizer review rate</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{organizerReviewRate}%</p>
          <p className="mt-1 text-xs text-slate-500">
            {reviewedOrganizers} submitted organizers fully reviewed
          </p>
        </Link>
        <Link
          href="/dashboard/documents"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:bg-amber-100/70"
        >
          <p className="text-sm font-semibold text-amber-700">Documents pending review</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{pendingDocs}</p>
          <p className="mt-1 text-xs text-amber-700">{returnCopies} final-return copies stored</p>
        </Link>
        <Link
          href="/dashboard/tasks"
          className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm transition hover:bg-violet-100/70"
        >
          <p className="text-sm font-semibold text-violet-700">Internal tasks</p>
          <p className="mt-2 text-3xl font-semibold text-violet-950">{openTasks ?? 0}</p>
          <p className="mt-1 text-xs text-violet-700">{overdueTasks ?? 0} overdue</p>
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/work?owner=unassigned"
          className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm transition hover:bg-orange-100/70"
        >
          <p className="text-sm font-semibold text-orange-700">Unassigned preparation</p>
          <p className="mt-2 text-3xl font-semibold text-orange-950">{unassignedPreparation}</p>
          <p className="mt-1 text-xs text-orange-700">Open returns without a preparer</p>
        </Link>
        <Link
          href="/dashboard/work"
          className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm transition hover:bg-cyan-100/70"
        >
          <p className="text-sm font-semibold text-cyan-700">Review stages without reviewer</p>
          <p className="mt-2 text-3xl font-semibold text-cyan-950">{unassignedReview}</p>
          <p className="mt-1 text-xs text-cyan-700">Review/filing-stage returns missing reviewer assignment</p>
        </Link>
      </section>
    </div>
  );
}
