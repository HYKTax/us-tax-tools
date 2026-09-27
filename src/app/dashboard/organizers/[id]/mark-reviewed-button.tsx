"use client";

import { useState, useTransition } from "react";
import { markReviewed } from "./actions";

export function MarkReviewedButton({ organizerId }: { organizerId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
        ✓ Marked reviewed
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markReviewed(organizerId);
            if (result.error) setError(result.error);
            else setDone(true);
          });
        }}
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark reviewed"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
