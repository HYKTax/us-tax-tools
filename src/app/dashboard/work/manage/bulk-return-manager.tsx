"use client";

import { useMemo, useState, useTransition } from "react";
import { bulkUpdateTaxReturnJobs } from "../actions";

type StaffOption = {
  id: string;
  full_name: string;
};

export type BulkJobOption = {
  id: string;
  tax_year: number;
  return_type: string;
  status: string;
  priority: string;
  due_date: string | null;
  client_name: string;
  preparer_name: string | null;
  reviewer_name: string | null;
};

export function BulkReturnManager({
  jobs,
  preparers,
  reviewers,
}: {
  jobs: BulkJobOption[];
  preparers: StaffOption[];
  reviewers: StaffOption[];
}) {
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priority, setPriority] = useState("");
  const [preparerValue, setPreparerValue] = useState("__keep__");
  const [reviewerValue, setReviewerValue] = useState("__keep__");
  const [dueDateMode, setDueDateMode] = useState<"keep" | "set" | "clear">("keep");
  const [dueDate, setDueDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const years = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.tax_year))).sort((a, b) => b - a),
    [jobs]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (yearFilter && String(job.tax_year) !== yearFilter) return false;
      if (statusFilter && job.status !== statusFilter) return false;
      if (!q) return true;
      return [
        job.client_name,
        job.return_type,
        String(job.tax_year),
        job.preparer_name ?? "",
        job.reviewer_name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [jobs, query, yearFilter, statusFilter]);

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 200) next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const job of visible) {
        if (next.size >= 200) break;
        next.add(job.id);
      }
      return next;
    });
  }

  function mode(value: string): { mode: "keep" | "set" | "clear"; id?: string } {
    if (value === "__keep__") return { mode: "keep" };
    if (value === "__clear__") return { mode: "clear" };
    return { mode: "set", id: value };
  }

  const preparer = mode(preparerValue);
  const reviewer = mode(reviewerValue);
  const hasChange =
    Boolean(priority) ||
    preparer.mode !== "keep" ||
    reviewer.mode !== "keep" ||
    dueDateMode !== "keep";

  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Apply changes</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Fields left as “No change” keep each return&apos;s existing value.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
          >
            <option value="">No change</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Preparer
          <select
            value={preparerValue}
            onChange={(event) => setPreparerValue(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
          >
            <option value="__keep__">No change</option>
            <option value="__clear__">Clear assignment</option>
            {preparers.map((member) => (
              <option key={member.id} value={member.id}>
                Assign {member.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Reviewer
          <select
            value={reviewerValue}
            onChange={(event) => setReviewerValue(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
          >
            <option value="__keep__">No change</option>
            <option value="__clear__">Clear assignment</option>
            {reviewers.map((member) => (
              <option key={member.id} value={member.id}>
                Assign {member.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Due date
          <select
            value={dueDateMode}
            onChange={(event) =>
              setDueDateMode(event.target.value as "keep" | "set" | "clear")
            }
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
          >
            <option value="keep">No change</option>
            <option value="set">Set due date</option>
            <option value="clear">Clear due date</option>
          </select>
        </label>

        {dueDateMode === "set" && (
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="mt-3 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
        )}

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          Active review locks are respected. Changing preparer or reviewer on a previously approved return can invalidate that approval, exactly as it does in the single-return editor.
        </div>

        <button
          type="button"
          disabled={
            pending ||
            selected.size === 0 ||
            !hasChange ||
            (dueDateMode === "set" && !dueDate)
          }
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await bulkUpdateTaxReturnJobs({
                jobIds: Array.from(selected),
                priority: priority || undefined,
                preparerMode: preparer.mode,
                preparerId: preparer.id,
                reviewerMode: reviewer.mode,
                reviewerId: reviewer.id,
                dueDateMode,
                dueDate: dueDate || undefined,
              });
              setMessage(result.error ?? result.message ?? "Bulk update complete.");
              if (result.success) setSelected(new Set());
            });
          }}
          className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending
            ? "Updating…"
            : `Update ${selected.size} return${selected.size === 1 ? "" : "s"}`}
        </button>

        {message && (
          <p className="mt-3 text-sm text-slate-600">{message}</p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Client, return, staff…"
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm xl:col-span-2"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value="not_started">Not started</option>
              <option value="waiting_on_client">Waiting on client</option>
              <option value="ready_to_prepare">Ready to prepare</option>
              <option value="preparing">Preparing</option>
              <option value="review">In review</option>
              <option value="waiting_on_signature">Waiting on signature</option>
              <option value="ready_to_file">Ready to file</option>
              <option value="e_filed">E-filed</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="extended">Extended</option>
            </select>
            <select
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">All years</option>
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {selected.size} selected · maximum 200 per batch
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectVisible}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[42rem] divide-y divide-slate-100 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              No return jobs match these filters.
            </p>
          ) : (
            visible.map((job) => (
              <label
                key={job.id}
                className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(job.id)}
                  onChange={() => toggle(job.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {job.client_name}
                    </p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                      {job.status.replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700">
                      {job.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {job.tax_year} {job.return_type}
                    {job.due_date
                      ? ` · Due ${new Date(job.due_date + "T00:00:00").toLocaleDateString()}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Preparer {job.preparer_name ?? "unassigned"} · Reviewer {job.reviewer_name ?? "unassigned"}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
