"use client";

import { useState, useTransition } from "react";
import { updateTaxReturnJob } from "../actions";

type StaffOption = { id: string; full_name: string };

export function ReturnJobEditor({
  job,
  preparers,
  reviewers,
}: {
  job: {
    id: string;
    client_id: string;
    status: string;
    priority: string;
    due_date: string | null;
    preparer_id: string | null;
    reviewer_id: string | null;
    extension_status: string;
    efile_status: string;
  };
  preparers: StaffOption[];
  reviewers: StaffOption[];
}) {
  const [status, setStatus] = useState(job.status);
  const [priority, setPriority] = useState(job.priority);
  const [dueDate, setDueDate] = useState(job.due_date ?? "");
  const [preparerId, setPreparerId] = useState(job.preparer_id ?? "");
  const [reviewerId, setReviewerId] = useState(job.reviewer_id ?? "");
  const [extensionStatus, setExtensionStatus] = useState(job.extension_status);
  const [efileStatus, setEfileStatus] = useState(job.efile_status);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const fieldClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await updateTaxReturnJob({
            id: job.id,
            clientId: job.client_id,
            status,
            priority,
            dueDate: dueDate || undefined,
            preparerId: preparerId || undefined,
            reviewerId: reviewerId || undefined,
            extensionStatus,
            efileStatus,
          });
          setMessage(result.error ?? "Return workflow updated.");
        });
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Workflow stage
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={fieldClass}>
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
            <option value="completed">Completed</option>
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className={fieldClass}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Preparer
          <select value={preparerId} onChange={(event) => setPreparerId(event.target.value)} className={fieldClass}>
            <option value="">Unassigned</option>
            {preparers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Reviewer
          <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className={fieldClass}>
            <option value="">Unassigned</option>
            {reviewers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
      </div>

      <label className="text-sm font-medium text-slate-700">
        Due date
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={fieldClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Extension
          <select value={extensionStatus} onChange={(event) => setExtensionStatus(event.target.value)} className={fieldClass}>
            <option value="not_needed">Not needed</option>
            <option value="planned">Planned</option>
            <option value="filed">Filed</option>
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          E-file status
          <select value={efileStatus} onChange={(event) => setEfileStatus(event.target.value)} className={fieldClass}>
            <option value="not_ready">Not ready</option>
            <option value="ready">Ready</option>
            <option value="transmitted">Transmitted</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save workflow"}
      </button>
      {message && <p className="text-sm text-slate-500">{message}</p>}
    </form>
  );
}
