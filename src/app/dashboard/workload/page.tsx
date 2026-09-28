import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  hasStaffPermission,
  staffRoleLabel,
  type StaffOperationalRole,
} from "@/lib/staff-permissions";

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  staff_role: StaffOperationalRole;
  is_active: boolean;
};

type JobRow = {
  id: string;
  preparer_id: string | null;
  reviewer_id: string | null;
  status: string;
  due_date: string | null;
};

type ReviewRow = {
  id: string;
  assigned_reviewer_id: string;
  status: string;
};

type TaskRow = {
  id: string;
  assigned_to: string | null;
  status: string;
  due_date: string | null;
};

type Workload = {
  preparation: number;
  reviewAssignments: number;
  formalReviews: number;
  overdueReturns: number;
  openTasks: number;
  overdueTasks: number;
};

function emptyWorkload(): Workload {
  return {
    preparation: 0,
    reviewAssignments: 0,
    formalReviews: 0,
    overdueReturns: 0,
    openTasks: 0,
    overdueTasks: 0,
  };
}

export default async function WorkloadPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasStaffPermission(profile, "audit.view")) redirect("/dashboard");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: staff, error: staffError },
    { data: jobs, error: jobsError },
    { data: reviews, error: reviewsError },
    { data: tasks, error: tasksError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,email,staff_role,is_active")
      .in("role", ["firm_admin", "firm_staff"])
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("tax_return_jobs")
      .select("id,preparer_id,reviewer_id,status,due_date")
      .not("status", "in", '("accepted","completed")')
      .limit(5000),
    supabase
      .from("tax_return_reviews")
      .select("id,assigned_reviewer_id,status")
      .eq("status", "requested")
      .limit(5000),
    supabase
      .from("staff_tasks")
      .select("id,assigned_to,status,due_date")
      .neq("status", "done")
      .limit(5000),
  ]);

  const staffRows = (staff ?? []) as StaffRow[];
  const jobRows = (jobs ?? []) as JobRow[];
  const reviewRows = (reviews ?? []) as ReviewRow[];
  const taskRows = (tasks ?? []) as TaskRow[];

  const workload = new Map<string, Workload>(
    staffRows.map((member) => [member.id, emptyWorkload()])
  );

  for (const job of jobRows) {
    if (job.preparer_id) {
      const row = workload.get(job.preparer_id);
      if (row) {
        row.preparation += 1;
        if (job.due_date && job.due_date < today) row.overdueReturns += 1;
      }
    }

    if (job.reviewer_id) {
      const row = workload.get(job.reviewer_id);
      if (row) {
        row.reviewAssignments += 1;
        if (
          job.due_date &&
          job.due_date < today &&
          job.reviewer_id !== job.preparer_id
        ) {
          row.overdueReturns += 1;
        }
      }
    }
  }

  for (const review of reviewRows) {
    const row = workload.get(review.assigned_reviewer_id);
    if (row) row.formalReviews += 1;
  }

  for (const task of taskRows) {
    if (!task.assigned_to) continue;
    const row = workload.get(task.assigned_to);
    if (!row) continue;
    row.openTasks += 1;
    if (task.due_date && task.due_date < today) row.overdueTasks += 1;
  }

  const unassignedPreparation = jobRows.filter(
    (job) =>
      !job.preparer_id &&
      !["review", "ready_to_file", "e_filed", "accepted", "completed"].includes(job.status)
  ).length;

  const unassignedReview = jobRows.filter(
    (job) =>
      !job.reviewer_id &&
      ["ready_to_prepare", "preparing", "review"].includes(job.status)
  ).length;

  const unassignedTasks = taskRows.filter((task) => !task.assigned_to).length;
  const overdueOpenReturns = jobRows.filter(
    (job) => job.due_date && job.due_date < today
  ).length;

  const errors = [staffError, jobsError, reviewsError, tasksError].filter(Boolean);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Manager view</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Team workload
          </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            See assigned preparation, formal review work, deadlines, and internal tasks across active staff.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/work/manage"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Bulk assign returns
          </Link>
          <Link
            href="/dashboard/tasks"
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open tasks
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active staff</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{staffRows.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Unassigned preparation</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{unassignedPreparation}</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-violet-700">Returns without reviewer</p>
          <p className="mt-2 text-3xl font-semibold text-violet-950">{unassignedReview}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Overdue open returns</p>
          <p className="mt-2 text-3xl font-semibold text-red-950">{overdueOpenReturns}</p>
        </div>
      </section>

      {unassignedTasks > 0 && (
        <Link
          href="/dashboard/tasks"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:bg-amber-100/70"
        >
          <p className="font-semibold text-amber-950">
            {unassignedTasks} open task{unassignedTasks === 1 ? "" : "s"} currently unassigned
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Open Tasks to assign responsibility.
          </p>
        </Link>
      )}

      {errors.length > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Some workload data could not be loaded.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Workload by team member</h2>
          <p className="mt-1 text-sm text-slate-500">
            Counts show current assignments only; they are workload facts, not performance ratings.
          </p>
        </div>

        {staffRows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No active staff profiles found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Team member</th>
                  <th className="px-5 py-3">Preparation</th>
                  <th className="px-5 py-3">Return reviewer</th>
                  <th className="px-5 py-3">Formal reviews</th>
                  <th className="px-5 py-3">Overdue returns</th>
                  <th className="px-5 py-3">Open tasks</th>
                  <th className="px-5 py-3">Overdue tasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffRows.map((member) => {
                  const row = workload.get(member.id) ?? emptyWorkload();

                  return (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{member.full_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{member.email}</p>
                        <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                          {staffRoleLabel(member.staff_role)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{row.preparation}</td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{row.reviewAssignments}</td>
                      <td className="px-5 py-4 font-semibold text-violet-700">{row.formalReviews}</td>
                      <td className="px-5 py-4">
                        <span className={row.overdueReturns > 0 ? "font-semibold text-red-700" : "text-slate-500"}>
                          {row.overdueReturns}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{row.openTasks}</td>
                      <td className="px-5 py-4">
                        <span className={row.overdueTasks > 0 ? "font-semibold text-red-700" : "text-slate-500"}>
                          {row.overdueTasks}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link
          href="/dashboard/work?owner=unassigned"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
        >
          <p className="font-semibold text-slate-950">Find unassigned returns</p>
          <p className="mt-1 text-sm text-slate-500">Open the return queue and assign ownership.</p>
        </Link>
        <Link
          href="/dashboard/deadlines"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
        >
          <p className="font-semibold text-slate-950">Review deadlines</p>
          <p className="mt-1 text-sm text-slate-500">See overdue and upcoming target dates.</p>
        </Link>
        <Link
          href="/dashboard/team"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300"
        >
          <p className="font-semibold text-slate-950">Team permissions</p>
          <p className="mt-1 text-sm text-slate-500">
            Firm Admins can manage staff access and operational roles.
          </p>
        </Link>
      </section>
    </div>
  );
}
