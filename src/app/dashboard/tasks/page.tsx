import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { TaskBoard, type TaskView } from "./task-board";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "tasks.manage")) notFound();

  const supabase = await createClient();
  const [{ data: tasks }, { data: clients }, { data: returns }, { data: staff }] =
    await Promise.all([
      supabase
        .from("staff_tasks")
        .select(
          "id,client_id,tax_return_job_id,title,details,status,priority,due_date,assigned_to,created_by,created_at,completed_at,client:clients(primary_contact_name),return:tax_return_jobs(tax_year,return_type),assignee:profiles!staff_tasks_assigned_to_fkey(full_name),creator:profiles!staff_tasks_created_by_fkey(full_name)"
        )
        .order("status", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("clients")
        .select("id,primary_contact_name")
        .eq("status", "active")
        .order("primary_contact_name")
        .limit(1000),
      supabase
        .from("tax_return_jobs")
        .select("id,client_id,tax_year,return_type,clients(primary_contact_name)")
        .not("status", "in", '("completed")')
        .order("tax_year", { ascending: false })
        .limit(1000),
      supabase
        .from("profiles")
        .select("id,full_name")
        .in("role", ["firm_admin", "firm_staff"])
        .eq("is_active", true)
        .order("full_name"),
    ]);

  const taskRows: TaskView[] = (tasks ?? []).map((task) => {
    const client = task.client as unknown as { primary_contact_name: string } | null;
    const linkedReturn = task.return as unknown as { tax_year: number; return_type: string } | null;
    const assignee = task.assignee as unknown as { full_name: string } | null;
    const creator = task.creator as unknown as { full_name: string } | null;

    return {
      id: task.id,
      client_id: task.client_id,
      tax_return_job_id: task.tax_return_job_id,
      title: task.title,
      details: task.details,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      assigned_to: task.assigned_to,
      created_by: task.created_by,
      created_at: task.created_at,
      completed_at: task.completed_at,
      client_name: client?.primary_contact_name ?? null,
      return_label: linkedReturn ? `${linkedReturn.tax_year} ${linkedReturn.return_type}` : null,
      assignee_name: assignee?.full_name ?? null,
      creator_name: creator?.full_name ?? "Staff",
    };
  });

  const openCount = taskRows.filter((task) => task.status !== "done").length;
  const myCount = taskRows.filter(
    (task) => task.status !== "done" && task.assigned_to === profile.id
  ).length;
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = taskRows.filter(
    (task) => task.status !== "done" && task.due_date && task.due_date < today
  ).length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Firm operations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Tasks</h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Track internal follow-ups, preparation handoffs, document questions, and filing work.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Open tasks</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{openCount}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">My tasks</p>
          <p className="mt-2 text-3xl font-semibold text-blue-950">{myCount}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Overdue</p>
          <p className="mt-2 text-3xl font-semibold text-red-950">{overdueCount}</p>
        </div>
      </section>

      <TaskBoard
        tasks={taskRows}
        clients={clients ?? []}
        returns={(returns ?? []) as unknown as Array<{
          id: string;
          client_id: string;
          tax_year: number;
          return_type: string;
          clients: { primary_contact_name: string } | null;
        }>}
        staff={staff ?? []}
        currentProfileId={profile.id}
      />
    </div>
  );
}
