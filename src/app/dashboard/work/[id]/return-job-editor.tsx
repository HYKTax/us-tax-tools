"use client";

import { useState, useTransition } from "react";
import { updateTaxReturnJob } from "../actions";

type StaffOption = { id: string; full_name: string };

export function ReturnJobEditor({
  job,
  preparers,
  reviewers,
  hasCurrentApproval,
  reviewLocked,
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
  hasCurrentApproval: boolean;
  reviewLocked: boolean;
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

  const fieldClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";
  const preReviewStatuses = [
    ["not_started", "Not started"],
    ["waiting_on_client", "Waiting on client"],
    ["ready_to_prepare", "Ready to prepare"],
    ["preparing", "Preparing"],
    ["extended", "Extended"],
    ["rejected", "Rejected / corrections"],
  ] as const;
  const postReviewStatuses = [
    ["waiting_on_signature", "Waiting on signature"],
    ["ready_to_file", "Ready to file"],
    ["e_filed", "E-filed"],
    ["accepted", "Accepted"],
    ["completed", "Completed"],
  ] as const;

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
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            disabled={reviewLocked}
            className={fieldClass}
          >
            {reviewLocked && <option value="review">In review</option>}
            {preReviewStatuses.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
            {hasCurrentApproval &&
              postReviewStatuses.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
          </select>
          <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
            {reviewLocked
              ? "Workflow and assignments are locked until the active review is resolved."
              : hasCurrentApproval
                ? "Reviewer approval is current, so filing stages are unlocked."
                : "Use Return review & sign-off below to unlock filing stages."}
          </span>
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
          <select value={preparerId} onChange={(event) => setPreparerId(event.target.value)} disabled={reviewLocked} className={fieldClass}>
            <option value="">Unassigned</option>
            {preparers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Reviewer
          <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} disabled={reviewLocked} className={fieldClass}>
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
          <select
            value={efileStatus}
            onChange={(event) => setEfileStatus(event.target.value)}
            disabled={reviewLocked || !hasCurrentApproval}
            className={fieldClass}
          >
            <option value="not_ready">Not ready</option>
            {hasCurrentApproval && (
              <>
                <option value="ready">Ready</option>
                <option value="transmitted">Transmitted</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </>
            )}
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
