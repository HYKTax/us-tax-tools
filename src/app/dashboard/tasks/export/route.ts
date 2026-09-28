import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type ExportTask = {
  title: string;
  details: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  client: { primary_contact_name: string; email: string } | null;
  linked_return: { tax_year: number; return_type: string; status: string } | null;
  assignee: { full_name: string; email: string } | null;
  creator: { full_name: string } | null;
};

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "tasks.manage")) {
    return new Response("Not authorized", { status: 403 });
  }

  const supabase = await createClient();
  const rows: ExportTask[] = [];
  let offset = 0;
  const pageSize = 500;

  while (offset < 10000) {
    const { data, error } = await supabase
      .from("staff_tasks")
      .select(
        "title,details,status,priority,due_date,created_at,completed_at,client:clients(primary_contact_name,email),linked_return:tax_return_jobs(tax_year,return_type,status),assignee:profiles!staff_tasks_assigned_to_fkey(full_name,email),creator:profiles!staff_tasks_created_by_fkey(full_name)"
      )
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) return new Response("Unable to export tasks.", { status: 500 });

    const batch = (data ?? []) as unknown as ExportTask[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const today = new Date().toISOString().slice(0, 10);
  const csv = [
    [
      "Task",
      "Details",
      "Status",
      "Priority",
      "Due date",
      "Overdue",
      "Client",
      "Client email",
      "Tax return",
      "Return status",
      "Assigned to",
      "Assignee email",
      "Created by",
      "Created",
      "Completed",
    ].map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.title,
        row.details ?? "",
        row.status,
        row.priority,
        row.due_date ?? "",
        row.status !== "done" && row.due_date && row.due_date < today ? "yes" : "no",
        row.client?.primary_contact_name ?? "",
        row.client?.email ?? "",
        row.linked_return
          ? `${row.linked_return.tax_year} ${row.linked_return.return_type}`
          : "",
        row.linked_return?.status ?? "",
        row.assignee?.full_name ?? "",
        row.assignee?.email ?? "",
        row.creator?.full_name ?? "",
        row.created_at,
        row.completed_at ?? "",
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="firm-tasks-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
