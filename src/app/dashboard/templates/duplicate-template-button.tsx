"use client";

import { useState, useTransition } from "react";
import { duplicateTemplate } from "./actions";

export function DuplicateTemplateButton({
  templateId,
  sourceYear,
}: {
  templateId: string;
  sourceYear: number;
}) {
  const [taxYear, setTaxYear] = useState(sourceYear + 1);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Year rollover
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          value={taxYear}
          min={2000}
          max={2100}
          disabled={pending}
          onChange={(event) => setTaxYear(Number(event.target.value))}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          aria-label="Duplicate template to tax year"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await duplicateTemplate({ templateId, taxYear });
              setMessage(result.error ?? "Template duplicated.");
            });
          }}
          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
        >
          {pending ? "Copying…" : "Duplicate"}
        </button>
      </div>
      {message && (
        <p className={"mt-2 text-xs " + (message === "Template duplicated." ? "text-emerald-700" : "text-red-600")}>
          {message}
        </p>
      )}
    </div>
  );
}
