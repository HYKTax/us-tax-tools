"use client";

import { useState, useTransition } from "react";
import { acknowledgeEngagement } from "@/app/dashboard/engagements/actions";

export function ClientEngagementCard({
  id,
  title,
  body,
  status,
  sentAt,
  acknowledgedName,
  acknowledgedAt,
}: {
  id: string;
  title: string;
  body: string;
  status: string;
  sentAt: string;
  acknowledgedName: string | null;
  acknowledgedAt: string | null;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Engagement
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Sent {new Date(sentAt).toLocaleString()}
            </p>
          </div>
          <span
            className={
              "w-fit rounded-full px-2.5 py-1 text-xs font-semibold " +
              (status === "acknowledged"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700")
            }
          >
            {status === "acknowledged" ? "Acknowledged" : "Action needed"}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
          {body}
        </div>

        {status === "acknowledged" ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">Acknowledgment recorded</p>
            <p className="mt-1 text-sm text-emerald-800">
              {acknowledgedName ?? "Client"}
              {acknowledgedAt
                ? " · " + new Date(acknowledgedAt).toLocaleString()
                : ""}
            </p>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              startTransition(async () => {
                const result = await acknowledgeEngagement(id, name);
                setMessage(
                  result.error ??
                    "Acknowledgment recorded. Refreshing status..."
                );
                if (result.success) {
                  window.location.reload();
                }
              });
            }}
            className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4"
          >
            <p className="font-semibold text-slate-950">Acknowledge this engagement</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              By submitting, you confirm that you reviewed this engagement and acknowledge it through the secure portal.
            </p>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Type your full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={240}
                autoComplete="name"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
              />
            </label>

            <label className="mt-4 flex items-start gap-3 text-sm text-slate-600">
              <input
                required
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span>
                I have reviewed the engagement text above and want to record my portal acknowledgment.
              </span>
            </label>

            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {pending ? "Recording…" : "Acknowledge engagement"}
            </button>

            {message && (
              <p className="mt-3 text-sm text-slate-600">{message}</p>
            )}
          </form>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-400">
          This page records a portal acknowledgment. It is not represented as an IRS Form 8879 electronic-signature service.
        </p>
      </div>
    </section>
  );
}
