"use client";

import { useMemo, useState, useTransition } from "react";
import { importClientRecords, type ClientImportRow } from "../actions";
import { parseCsv } from "@/lib/csv";

const requiredHeaders = ["primary_contact_name", "email"] as const;
const supportedHeaders = new Set([
  "primary_contact_name",
  "email",
  "client_type",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "state_region",
  "postal_code",
  "country",
  "preferred_contact_method",
]);

type ParsedRow = ClientImportRow & { rowNumber: number };

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function ClientCsvImporter() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const duplicateEmails = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      if (!email) continue;
      counts.set(email, (counts.get(email) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([email]) => email)
    );
  }, [rows]);

  const rowIssues = useMemo(() => {
    const issues = new Map<number, string[]>();

    for (const row of rows) {
      const rowErrors: string[] = [];
      const email = row.email.trim().toLowerCase();
      const type = (row.client_type || "individual").trim().toLowerCase();
      const preferred = (row.preferred_contact_method || "portal").trim().toLowerCase();

      if (!row.primary_contact_name.trim()) rowErrors.push("Missing name");
      if (!email || !email.includes("@")) rowErrors.push("Invalid email");
      if (duplicateEmails.has(email)) rowErrors.push("Duplicate email in CSV");
      if (!["individual", "business"].includes(type)) rowErrors.push("Invalid client type");
      if (!["portal", "email", "phone"].includes(preferred)) {
        rowErrors.push("Invalid contact method");
      }

      if (rowErrors.length) issues.set(row.rowNumber, rowErrors);
    }

    return issues;
  }, [rows, duplicateEmails]);

  const valid = rows.length > 0 && rowIssues.size === 0 && rows.length <= 500;

  async function readFile(file: File) {
    setFileName(file.name);
    setRows([]);
    setParseError(null);
    setResult(null);

    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("CSV file must be 2 MB or smaller.");
      }

      const text = await file.text();
      const table = parseCsv(text);
      if (table.length < 2) {
        throw new Error("CSV must include a header row and at least one client.");
      }

      const headerRow = table[0];
      if (!headerRow) {
        throw new Error("CSV header row is missing.");
      }
      const headers = headerRow.map(normalizeHeader);
      for (const required of requiredHeaders) {
        if (!headers.includes(required)) {
          throw new Error(`Missing required column: ${required}`);
        }
      }

      const unknown = headers.filter((header) => header && !supportedHeaders.has(header));
      if (unknown.length) {
        throw new Error(`Unsupported column${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
      }

      const parsed: ParsedRow[] = table
        .slice(1)
        .map((cells, index) => {
          const record: Record<string, string> = {};
          headers.forEach((header, column) => {
            if (header) record[header] = cells[column]?.trim() ?? "";
          });

          return {
            rowNumber: index + 2,
            primary_contact_name: record.primary_contact_name ?? "",
            email: record.email ?? "",
            client_type: record.client_type || "individual",
            phone: record.phone || "",
            address_line1: record.address_line1 || "",
            address_line2: record.address_line2 || "",
            city: record.city || "",
            state_region: record.state_region || "",
            postal_code: record.postal_code || "",
            country: record.country || "",
            preferred_contact_method: record.preferred_contact_method || "portal",
          };
        })
        .filter((row) =>
          Object.entries(row)
            .filter(([key]) => key !== "rowNumber")
            .some(([, value]) => String(value ?? "").trim())
        );

      if (parsed.length === 0) throw new Error("No client rows were found.");
      if (parsed.length > 500) {
        throw new Error("Import no more than 500 clients at a time.");
      }

      setRows(parsed);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "CSV could not be parsed.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">1. Prepare your CSV</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Required columns: primary_contact_name and email. Optional columns can include
              type, phone, address, country, and preferred contact method.
            </p>
          </div>
          <a
            href="/dashboard/clients/import/template"
            className="w-fit rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Download template
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">2. Upload and preview</h2>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:border-blue-400 hover:bg-blue-50/50">
          <span className="text-sm font-semibold text-slate-900">Choose CSV file</span>
          <span className="mt-1 text-xs text-slate-500">Maximum 500 clients · 2 MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
        </label>
        {fileName && <p className="mt-3 text-sm text-slate-500">Loaded: {fileName}</p>}
        {parseError && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {parseError}
          </p>
        )}
      </section>

      {rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-slate-950">Preview</h2>
              <p className="mt-1 text-sm text-slate-500">
                {rows.length} row{rows.length === 1 ? "" : "s"} · {rowIssues.size} row{rowIssues.size === 1 ? "" : "s"} with issues
              </p>
            </div>
            <button
              type="button"
              disabled={pending || !valid}
              onClick={() => {
                setResult(null);
                startTransition(async () => {
                  const response = await importClientRecords(
                    rows.map(({ rowNumber: _rowNumber, ...row }) => row)
                  );
                  if (response.error) {
                    setResult(response.error);
                  } else {
                    setResult(
                      `Import complete: ${response.created ?? 0} created, ${response.skipped ?? 0} skipped as existing.`
                    );
                    if ((response.created ?? 0) > 0) setRows([]);
                  }
                });
              }}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Importing…" : "Import clients"}
            </button>
          </div>

          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const issues = rowIssues.get(row.rowNumber) ?? [];
                  return (
                    <tr key={row.rowNumber} className={issues.length ? "bg-red-50/40" : ""}>
                      <td className="px-4 py-3 text-slate-400">{row.rowNumber}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.primary_contact_name}</td>
                      <td className="px-4 py-3 text-slate-600">{row.email}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{row.client_type || "individual"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.phone || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {[row.city, row.state_region, row.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {issues.length ? (
                          <span className="text-xs font-semibold text-red-700">{issues.join(" · ")}</span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700">Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result && (
            <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-700">{result}</p>
          )}
        </section>
      )}
    </div>
  );
}
