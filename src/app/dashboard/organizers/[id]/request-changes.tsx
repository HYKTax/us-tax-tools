"use client";

import { useState, useTransition } from "react";
import { requestChanges } from "./actions";

export function RequestChanges({ organizerId }: { organizerId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
        Request corrections from client
      </summary>
      <form
        className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(undefined);
          startTransition(async () => {
            try {
              const result = await requestChanges(organizerId, reason);
              if (result.error) setError(result.error);
            } catch {
              setError("Unable to request changes. Please refresh and try again.");
            }
          });
        }}
      >
        <label htmlFor="change-reason" className="text-sm font-medium text-slate-700">
          Explain what needs to be corrected
        </label>
        <textarea
          id="change-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={5000}
          rows={4}
          disabled={pending}
          placeholder="Example: Please update the brokerage section and upload the complete consolidated 1099."
          className="rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <p>This reopens the organizer for editing and notifies the client.</p>
          <span>{reason.length}/5000</span>
        </div>
        <button
          disabled={pending || !reason.trim()}
          className="w-fit rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending request…" : "Request changes"}
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </details>
  );
}
