import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";

type ReviewQueueRow = {
  id: string;
  requested_at: string;
  request_note: string | null;
  tax_return_job_id: string;
  job: {
    id: string;
    client_id: string;
    tax_year: number;
    return_type: string;
    priority: string;
    due_date: string | null;
    clients: { primary_contact_name: string } | null;
    preparer: { full_name: string } | null;
  } | null;
};

type WorkRow = {
  id: string;
  client_id: string;
  tax_year: number;
  return_type: string;
  status: string;
  priority: string;
  due_date: string | null;
  updated_at: string;
  preparer_id: string | null;
  reviewer_id: string | null;
  preparer: { full_name: string } | null;
  reviewer: { full_name: string } | null;
  clients: { primary_contact_name: string; client_type: string } | null;
};

function stageFor(status: string) {
  const map: Record<string, { label: string; classes: string }> = {
    not_started: { label: "Not started", classes: "bg-slate-100 text-slate-600" },
    waiting_on_client: { label: "Waiting on client", classes: "bg-amber-50 text-amber-700" },
    ready_to_prepare: { label: "Ready to prepare", classes: "bg-cyan-50 text-cyan-700" },
    preparing: { label: "Preparing", classes: "bg-blue-50 text-blue-700" },
    review: { label: "In review", classes: "bg-violet-50 text-violet-700" },
    waiting_on_signature: { label: "Waiting on signature", classes: "bg-amber-50 text-amber-700" },
    ready_to_file: { label: "Ready to file", classes: "bg-cyan-50 text-cyan-700" },
    e_filed: { label: "E-filed", classes: "bg-indigo-50 text-indigo-700" },
    accepted: { label: "Accepted", classes: "bg-emerald-50 text-emerald-700" },
    rejected: { label: "Rejected", classes: "bg-red-50 text-red-700" },
    extended: { label: "Extended", classes: "bg-orange-50 text-orange-700" },
    completed: { label: "Completed", classes: "bg-emerald-50 text-emerald-700" },
  };
  return map[status] ?? { label: status.replaceAll("_", " "), classes: "bg-slate-100 text-slate-600" };
}

function priorityLabel(priority: string) {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Normal";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await searchParams;
  const query = firstParam(filters.q).trim().toLowerCase();
  const statusFilter = firstParam(filters.status);
  const priorityFilter = firstParam(filters.priority);
  const ownerFilter = firstParam(filters.owner);
  const yearFilter = firstParam(filters.year);
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const canReviewReturns = Boolean(
    profile && hasStaffPermission(profile, "returns.review")
  );

  const [{ data, error }, reviewResult] = await Promise.all([
    supabase
    .from("tax_return_jobs")
    .select(
      "id, client_id, tax_year, return_type, status, priority, due_date, updated_at, preparer_id, reviewer_id, clients(primary_contact_name, client_type), preparer:profiles!tax_return_jobs_preparer_id_fkey(full_name), reviewer:profiles!tax_return_jobs_reviewer_id_fkey(full_name)"
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500),
    canReviewReturns && profile
      ? supabase
          .from("tax_return_reviews")
          .select(
            "id, requested_at, request_note, tax_return_job_id, job:tax_return_jobs!tax_return_reviews_tax_return_job_id_fkey(id,client_id,tax_year,return_type,priority,due_date,clients(primary_contact_name),preparer:profiles!tax_return_jobs_preparer_id_fkey(full_name))"
          )
          .eq("status", "requested")
          .eq("assigned_reviewer_id", profile.id)
          .order("requested_at", { ascending: true })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const allRows = (data ?? []) as unknown as WorkRow[];
  const myReviews = (reviewResult.data ?? []) as unknown as ReviewQueueRow[];

  const rows = allRows.filter((row) => {
    if (query) {
      const searchable = [
        row.clients?.primary_contact_name ?? "",
        row.return_type,
        String(row.tax_year),
        row.preparer?.full_name ?? "",
        row.reviewer?.full_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    if (statusFilter && row.status !== statusFilter) return false;
    if (priorityFilter && row.priority !== priorityFilter) return false;
    if (yearFilter && String(row.tax_year) !== yearFilter) return false;
    if (ownerFilter === "mine" && profile) {
      if (row.preparer_id !== profile.id && row.reviewer_id !== profile.id) return false;
    }
    if (ownerFilter === "unassigned") {
      if (row.preparer_id || row.reviewer_id) return false;
    }
    return true;
  });

  const myPreparation = profile
    ? allRows.filter(
        (row) =>
          row.preparer_id === profile.id &&
          !["review", "ready_to_file", "e_filed", "accepted", "completed"].includes(row.status)
      )
    : [];
  const waiting = allRows.filter((row) => row.status === "waiting_on_client").length;
  const review = allRows.filter((row) => row.status === "review").length;
  const filing = allRows.filter((row) => ["ready_to_file", "e_filed", "rejected"].includes(row.status)).length;
  const completed = allRows.filter((row) => ["accepted", "completed"].includes(row.status)).length;

  const today = new Date().toISOString().slice(0, 10);
  const dueSoonDate = new Date();
  dueSoonDate.setUTCDate(dueSoonDate.getUTCDate() + 7);
  const dueSoon = dueSoonDate.toISOString().slice(0, 10);
  const activeForDeadline = (row: WorkRow) =>
    !["accepted", "completed"].includes(row.status);
  const overdue = allRows.filter(
    (row) => activeForDeadline(row) && row.due_date && row.due_date < today
  ).length;
  const dueThisWeek = allRows.filter(
    (row) =>
      activeForDeadline(row) &&
      row.due_date &&
      row.due_date >= today &&
      row.due_date <= dueSoon
  ).length;
  const availableYears = Array.from(new Set(allRows.map((row) => row.tax_year))).sort(
    (a, b) => b - a
  );
  const hasFilters = Boolean(
    query || statusFilter || priorityFilter || ownerFilter || yearFilter
  );

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Firm workflow</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Work / Returns</h1>
          <p className="mt-2 text-slate-500">
            Track preparation, review, extensions, signatures, and e-file status across the firm.
          </p>
        </div>
        <Link href="/dashboard/clients" className="w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Create return from client
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Overdue</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-red-950">{overdue}</p>
          <p className="mt-1 text-xs text-red-700">Open returns past their target due date</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Due in 7 days</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-950">{dueThisWeek}</p>
          <p className="mt-1 text-xs text-amber-700">Open returns approaching their target due date</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">My preparation queue</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-blue-950">{myPreparation.length}</p>
          <p className="mt-1 text-xs text-blue-700">Returns assigned to you before final review</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-violet-700">My review queue</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-violet-950">{myReviews.length}</p>
          <p className="mt-1 text-xs text-violet-700">
            {canReviewReturns ? "Formal reviews assigned to you" : "Your role does not include return review"}
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Waiting on clients</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{waiting}</p>
          <p className="mt-1 text-xs text-slate-500">Returns blocked by client action</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">In review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{review}</p>
          <p className="mt-1 text-xs text-slate-500">Returns awaiting reviewer action</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Filing queue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{filing}</p>
          <p className="mt-1 text-xs text-slate-500">Ready, transmitted, or rejected</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Accepted / completed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{completed}</p>
          <p className="mt-1 text-xs text-slate-500">Finished return work</p>
        </div>
      </section>

      {myPreparation.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="border-b border-blue-100 bg-blue-50 px-5 py-4">
            <h2 className="font-semibold text-blue-950">My preparation queue</h2>
            <p className="mt-1 text-sm text-blue-700">
              Your assigned returns that still need preparation work before final review.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {myPreparation.slice(0, 12).map((row) => {
              const stage = stageFor(row.status);
              return (
                <Link
                  key={row.id}
                  href={`/dashboard/work/${row.id}`}
                  className="flex flex-col justify-between gap-4 px-5 py-4 transition hover:bg-blue-50/40 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stage.classes}`}>
                        {stage.label}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {priorityLabel(row.priority)}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-slate-950">
                      {row.tax_year} {row.return_type} · {row.clients?.primary_contact_name ?? "Client"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Reviewer {row.reviewer?.full_name ?? "not assigned"}
                      {row.due_date
                        ? ` · Due ${new Date(row.due_date + "T00:00:00").toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-blue-600">Prepare →</span>
                </Link>
              );
            })}
          </div>
          {myPreparation.length > 12 && (
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Showing the first 12 of {myPreparation.length} assigned preparation returns.
            </p>
          )}
        </section>
      )}

      {canReviewReturns && myReviews.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 bg-violet-50 px-5 py-4">
            <h2 className="font-semibold text-violet-950">My review queue</h2>
            <p className="mt-1 text-sm text-violet-700">
              Returns formally assigned to you and waiting for review sign-off.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {myReviews.map((reviewRow) => {
              const job = reviewRow.job;
              if (!job) return null;
              return (
                <Link
                  key={reviewRow.id}
                  href={`/dashboard/work/${job.id}`}
                  className="flex flex-col justify-between gap-4 px-5 py-4 transition hover:bg-violet-50/40 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        Review requested
                      </span>
                      <span className="text-xs font-medium text-slate-400">
                        {new Date(reviewRow.requested_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-slate-950">
                      {job.tax_year} {job.return_type} · {job.clients?.primary_contact_name ?? "Client"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Prepared by {job.preparer?.full_name ?? "Unassigned"}
                      {job.due_date
                        ? ` · Due ${new Date(job.due_date + "T00:00:00").toLocaleDateString()}`
                        : ""}
                    </p>
                    {reviewRow.request_note && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                        {reviewRow.request_note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
                      {priorityLabel(job.priority)}
                    </span>
                    <span className="text-sm font-semibold text-blue-600">Review →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Filter return queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search clients and narrow the firm queue without changing workflow data.
            </p>
          </div>
          {hasFilters && (
            <Link
              href="/dashboard/work"
              className="w-fit text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Clear filters
            </Link>
          )}
        </div>
        <form action="/dashboard/work" method="get" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            name="q"
            defaultValue={firstParam(filters.q)}
            placeholder="Client, return, staff…"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 xl:col-span-2"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All stages</option>
            <option value="waiting_on_client">Waiting on client</option>
            <option value="ready_to_prepare">Ready to prepare</option>
            <option value="preparing">Preparing</option>
            <option value="review">In review</option>
            <option value="waiting_on_signature">Waiting on signature</option>
            <option value="ready_to_file">Ready to file</option>
            <option value="e_filed">E-filed</option>
            <option value="rejected">Rejected</option>
            <option value="extended">Extended</option>
            <option value="accepted">Accepted</option>
            <option value="completed">Completed</option>
          </select>
          <select
            name="priority"
            defaultValue={priorityFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <select
            name="owner"
            defaultValue={ownerFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">Any owner</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <select
            name="year"
            defaultValue={yearFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 md:col-span-2 xl:col-span-1"
          >
            Apply filters
          </button>
        </form>
      </section>

      {(error || reviewResult.error) && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load the work queue: {error?.message ?? reviewResult.error?.message}
        </p>
      )}

      {!error && allRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No tax returns in the queue yet</h2>
          <p className="mt-2 text-sm text-slate-500">Open a client profile and create their first return.</p>
          <Link href="/dashboard/clients" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Open clients
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Return queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              {rows.length} matching return{rows.length === 1 ? "" : "s"} · {allRows.length} loaded from the firm queue.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Return</th>
                  <th className="px-5 py-3">Stage</th>
                  <th className="px-5 py-3">Preparer</th>
                  <th className="px-5 py-3">Reviewer</th>
                  <th className="px-5 py-3">Due</th>
                  <th className="px-5 py-3">Priority</th>
                  <th className="px-5 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <p className="font-medium text-slate-800">No returns match these filters</p>
                      <p className="mt-1 text-sm text-slate-500">Clear or adjust the filters above.</p>
                    </td>
                  </tr>
                ) : rows.map((row) => {
                  const stage = stageFor(row.status);
                  return (
                    <tr key={row.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/clients/${row.client_id}`} className="font-semibold text-slate-900 hover:text-blue-600">
                          {row.clients?.primary_contact_name ?? "Client"}
                        </Link>
                        <p className="mt-1 text-xs capitalize text-slate-500">{row.clients?.client_type ?? "client"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{row.tax_year} {row.return_type}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stage.classes}`}>{stage.label}</span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.preparer?.full_name ?? "Unassigned"}</td>
                      <td className="px-5 py-4 text-slate-600">{row.reviewer?.full_name ?? "Unassigned"}</td>
                      <td className="px-5 py-4">
                        {row.due_date ? (
                          <div>
                            <p className="text-slate-600">{new Date(row.due_date + "T00:00:00").toLocaleDateString()}</p>
                            {activeForDeadline(row) && row.due_date < today ? (
                              <span className="mt-1 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                Overdue
                              </span>
                            ) : activeForDeadline(row) && row.due_date <= dueSoon ? (
                              <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                Due soon
                              </span>
                            ) : null}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{priorityLabel(row.priority)}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/dashboard/work/${row.id}`} className="font-semibold text-blue-600 hover:text-blue-700">Open →</Link>
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
