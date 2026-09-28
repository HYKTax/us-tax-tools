"use client";

import { useMemo, useState } from "react";
import type { TaxExportRow } from "@/lib/tax-software-export";

export function TaxEntryAssistant({
  rows,
  softwareLabel,
}: {
  rows: TaxExportRow[];
  softwareLabel: string;
}) {
  const [entered, setEntered] = useState<Set<number>>(new Set());
  const [show, setShow] = useState<"all" | "mapped" | "manual">("all");
  const [copied, setCopied] = useState<number | null>(null);

  const visible = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
          if (show === "mapped") return row.mapped;
          if (show === "manual") return !row.mapped;
          return true;
        }),
    [rows, show]
  );

  const enteredCount = entered.size;
  const percent = Math.round((enteredCount / Math.max(1, rows.length)) * 100);

  async function copyValue(index: number, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(index);
    window.setTimeout(() => setCopied((current) => (current === index ? null : current)), 1200);
  }

  function toggleEntered(index: number) {
    setEntered((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-blue-600">Guided entry</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{softwareLabel}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Work through reviewed source values one line at a time. Progress is local to this browser session and does not alter the approved return data.
            </p>
          </div>
          <div className="min-w-48">
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>{enteredCount}/{rows.length} entered</span>
              <span>{percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: percent + "%" }}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {([
            ["all", "All fields"],
            ["mapped", "Mapped only"],
            ["manual", "Manual mapping"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setShow(value)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                (show === value
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {visible.map(({ row, index }) => {
            const done = entered.has(index);
            return (
              <div
                key={row.sourceDocument + ":" + row.sourceField + ":" + index}
                className={"p-5 transition " + (done ? "bg-emerald-50/40" : "")}
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                          (row.mapped
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-800")
                        }
                      >
                        {row.mapped ? "Mapped" : "Manual"}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {row.sourceDocumentType}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                      {row.sourceDocument}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Source field: <span className="font-mono">{row.sourceField}</span>
                    </p>
                  </div>

                  <div>
                    {row.mapped ? (
                      <>
                        <p className="text-xs font-medium text-slate-500">{row.targetArea}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{row.targetField}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-amber-700">Manual mapping required</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Use the original source document and verify where this field belongs.
                        </p>
                      </>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="max-w-full break-all rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-semibold text-slate-900">
                        {row.value}
                      </code>
                      {row.confidence !== null && (
                        <span className="text-xs text-slate-400">
                          {Math.round(row.confidence * 100)}% extraction confidence
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => copyValue(index, row.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copied === index ? "Copied" : "Copy value"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleEntered(index)}
                      className={
                        "rounded-xl px-3.5 py-2 text-sm font-semibold " +
                        (done
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-blue-600 text-white hover:bg-blue-700")
                      }
                    >
                      {done ? "Entered ✓" : "Mark entered"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {visible.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No fields match this filter.
          </div>
        )}
      </section>
    </div>
  );
}
