"use client";

import { useState, useTransition } from "react";
import {
  requestTaxReturnReview,
  resolveTaxReturnReview,
} from "../actions";

type ReviewRow = {
  id: string;
  cycle_number: number;
  return_version: number;
  status: "requested" | "changes_requested" | "approved";
  request_note: string | null;
  resolution_note: string | null;
  requested_at: string;
  resolved_at: string | null;
  requester_name: string;
  reviewer_name: string;
  resolver_name: string | null;
};

function statusClasses(status: ReviewRow["status"]) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "changes_requested") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

function statusLabel(status: ReviewRow["status"]) {
  if (status === "changes_requested") return "Changes requested";
  if (status === "approved") return "Approved";
  return "In review";
}

export function ReturnReviewPanel({
  jobId,
  clientId,
  jobStatus,
  preparerAssigned,
  reviewerAssigned,
  reviews,
  canManageReturns,
  canReviewReturns,
}: {
  jobId: string;
  clientId: string;
  jobStatus: string;
  preparerAssigned: boolean;
  reviewerAssigned: boolean;
  reviews: ReviewRow[];
  canManageReturns: boolean;
  canReviewReturns: boolean;
}) {
  const openReview = reviews.find((review) => review.status === "requested") ?? null;
  const [requestNote, setRequestNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const requestEligible = [
    "ready_to_prepare",
    "preparing",
    "extended",
    "rejected",
  ].includes(jobStatus);

  const runRequest = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await requestTaxReturnReview(jobId, clientId, requestNote);
      setMessage(result.error ?? result.message ?? "Return sent to review.");
      if (result.success) setRequestNote("");
    });
  };

  const resolve = (decision: "approved" | "changes_requested") => {
    if (!openReview) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resolveTaxReturnReview({
        reviewId: openReview.id,
        jobId,
        clientId,
        decision,
        note: resolutionNote,
      });
      setMessage(result.error ?? result.message ?? "Review updated.");
      if (result.success) setResolutionNote("");
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold text-slate-950">Return review & sign-off</h2>
          <p className="mt-1 text-sm text-slate-500">
            Formal review cycles control when this return can move into filing.
          </p>
        </div>
        {openReview ? (
          <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            Cycle {openReview.cycle_number} · In review
          </span>
        ) : reviews[0]?.status === "approved" ? (
          <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            Latest review approved
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div>
          {openReview ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Review cycle {openReview.cycle_number}
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Requested by</dt>
                  <dd className="font-medium text-slate-800">{openReview.requester_name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Assigned reviewer</dt>
                  <dd className="font-medium text-slate-800">{openReview.reviewer_name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Requested</dt>
                  <dd className="font-medium text-slate-800">
                    {new Date(openReview.requested_at).toLocaleString()}
                  </dd>
                </div>
              </dl>
              {openReview.request_note && (
                <div className="mt-4 rounded-lg bg-white p-3 text-sm leading-6 text-slate-700">
                  {openReview.request_note}
                </div>
              )}

              {canReviewReturns ? (
                <div className="mt-5">
                  <label className="text-sm font-medium text-slate-700">
                    Review notes
                    <textarea
                      value={resolutionNote}
                      onChange={(event) => setResolutionNote(event.target.value)}
                      rows={4}
                      maxLength={5000}
                      placeholder="Add approval notes, or explain the corrections required…"
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => resolve("approved")}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {pending ? "Updating…" : "Approve return"}
                    </button>
                    <button
                      type="button"
                      disabled={pending || !resolutionNote.trim()}
                      onClick={() => resolve("changes_requested")}
                      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      Request changes
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Approval checks linked document review, AI review, source-data conflicts, assignment, and separation of duties.
                  </p>
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                  This review is waiting for the assigned Reviewer, a Manager, or a Firm Admin.
                </p>
              )}
            </div>
          ) : canManageReturns ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">Request review</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Filing stages remain locked until a review cycle is approved.
              </p>

              {!preparerAssigned || !reviewerAssigned ? (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  Assign both a preparer and reviewer before requesting review.
                </p>
              ) : !requestEligible ? (
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  Move the return into preparation before requesting review.
                </p>
              ) : (
                <>
                  <textarea
                    value={requestNote}
                    onChange={(event) => setRequestNote(event.target.value)}
                    rows={4}
                    maxLength={5000}
                    placeholder="Optional note for the reviewer…"
                    className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={runRequest}
                    className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {pending ? "Requesting…" : "Request review"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Your role can view the review history but cannot request a review.
            </p>
          )}

          {message && <p className="mt-3 text-sm text-slate-500">{message}</p>}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">Review history</p>
          {!reviews.length ? (
            <p className="mt-3 text-sm text-slate-500">No review cycles yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      Cycle {review.cycle_number} · Return version {review.return_version}
                    </p>
                    <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + statusClasses(review.status)}>
                      {statusLabel(review.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Requested by {review.requester_name} · Reviewer {review.reviewer_name} · {new Date(review.requested_at).toLocaleString()}
                  </p>
                  {review.request_note && (
                    <p className="mt-2 text-sm leading-6 text-slate-700">{review.request_note}</p>
                  )}
                  {review.resolved_at && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="text-xs text-slate-500">
                        Resolved by {review.resolver_name ?? "Reviewer"} · {new Date(review.resolved_at).toLocaleString()}
                      </p>
                      {review.resolution_note && (
                        <p className="mt-2 text-sm leading-6 text-slate-700">{review.resolution_note}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
