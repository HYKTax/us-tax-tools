"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  createStaffTask,
  deleteStaffTask,
  updateStaffTaskStatus,
} from "./actions";

type ClientOption = {
  id: string;
  primary_contact_name: string;
};

type ReturnOption = {
  id: string;
  client_id: string;
  tax_year: number;
  return_type: string;
  clients: { primary_contact_name: string } | null;
};

type StaffOption = {
  id: string;
  full_name: string;
};

export type TaskView = {
  id: string;
  client_id: string | null;
  tax_return_job_id: string | null;
  title: string;
  details: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  client_name: string | null;
  return_label: string | null;
  assignee_name: string | null;
  creator_name: string;
};

function priorityClasses(priority: string) {
  if (priority === "urgent") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "low") return "bg-slate-100 text-slate-600";
  return "bg-blue-50 text-blue-700";
}

export function TaskBoard({
  tasks,
  clients,
  returns,
  staff,
  currentProfileId,
}: {
  tasks: TaskView[];
  clients: ClientOption[];
  returns: ReturnOption[];
  staff: StaffOption[];
  currentProfileId: string;
}) {
  const [filter, setFilter] = useState<"open" | "mine" | "overdue" | "done">("open");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [clientId, setClientId] = useState("");
  const [returnId, setReturnId] = useState("");
  const [assignedTo, setAssignedTo] = useState(currentProfileId);
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === "open" && task.status === "done") return false;
      if (filter === "mine" && (task.assigned_to !== currentProfileId || task.status === "done")) return false;
      if (filter === "overdue" && !(task.status !== "done" && task.due_date && task.due_date < today)) return false;
      if (filter === "done" && task.status !== "done") return false;
      if (q) {
        const haystack = [
          task.title,
          task.details ?? "",
          task.client_name ?? "",
          task.return_label ?? "",
          task.assignee_name ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filter, query, currentProfileId, today]);

  const eligibleReturns = clientId
    ? returns.filter((item) => item.client_id === clientId)
    : returns;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createStaffTask({
        title,
        details: details || undefined,
        clientId: clientId || undefined,
        taxReturnJobId: returnId || undefined,
        assignedTo: assignedTo || undefined,
        priority,
        dueDate: dueDate || undefined,
      });

      if (result.error) {
        setMessage(result.error);
        return;
      }

      setTitle("");
      setDetails("");
      setClientId("");
      setReturnId("");
      setDueDate("");
      setPriority("normal");
      setMessage("Task created.");
    });
  }

  function changeStatus(taskId: string, status: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateStaffTaskStatus(taskId, status);
      if (result.error) setMessage(result.error);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <form
        onSubmit={submit}
        className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="font-semibold text-slate-950">Create task</h2>
        <p className="mt-1 text-sm text-slate-500">
          Keep internal follow-ups tied to the client or tax return when useful.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Task
          <input
            value={title}
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Review missing brokerage statement"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Details
          <textarea
            value={details}
            maxLength={5000}
            rows={3}
            onChange={(event) => setDetails(event.target.value)}
            className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Client
            <select
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setReturnId("");
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">No client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.primary_contact_name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Return
            <select
              value={returnId}
              onChange={(event) => {
                const id = event.target.value;
                setReturnId(id);
                const selectedReturn = returns.find((item) => item.id === id);
                if (selectedReturn) setClientId(selectedReturn.client_id);
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">No return</option>
              {eligibleReturns.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.tax_year} {item.return_type} · {item.clients?.primary_contact_name ?? "Client"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Assign to
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>{member.full_name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Priority
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
        </label>

        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create task"}
        </button>

        {message && (
          <p className="mt-3 text-sm text-slate-600">{message}</p>
        )}
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-slate-950">Task queue</h2>
              <p className="mt-1 text-sm text-slate-500">{filtered.length} matching task{filtered.length === 1 ? "" : "s"}</p>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks…"
              className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["open", "mine", "overdue", "done"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-semibold capitalize " +
                  (filter === value
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                }
              >
                {value === "mine" ? "My tasks" : value}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No tasks match this view.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((task) => {
              const overdue = task.status !== "done" && task.due_date && task.due_date < today;
              return (
                <article key={task.id} className="px-5 py-4">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${priorityClasses(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                          {task.status.replaceAll("_", " ")}
                        </span>
                        {overdue && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            Overdue
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 font-semibold text-slate-950">{task.title}</h3>
                      {task.details && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{task.details}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Assigned: {task.assignee_name ?? "Unassigned"}</span>
                        {task.due_date && <span>Due {new Date(task.due_date + "T00:00:00").toLocaleDateString()}</span>}
                        <span>Created by {task.creator_name}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                        {task.client_id && (
                          <Link href={`/dashboard/clients/${task.client_id}`} className="text-blue-600 hover:text-blue-700">
                            {task.client_name ?? "Client"} →
                          </Link>
                        )}
                        {task.tax_return_job_id && (
                          <Link href={`/dashboard/work/${task.tax_return_job_id}`} className="text-blue-600 hover:text-blue-700">
                            {task.return_label ?? "Return"} →
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {task.status !== "in_progress" && task.status !== "done" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => changeStatus(task.id, "in_progress")}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Start
                        </button>
                      )}
                      {task.status !== "done" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => changeStatus(task.id, "done")}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Complete
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => changeStatus(task.id, "open")}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Reopen
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteStaffTask(task.id);
                            if (result.error) setMessage(result.error);
                          })
                        }
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
