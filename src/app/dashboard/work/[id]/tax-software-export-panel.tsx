import {
  buildTaxSoftwareExport,
  type TaxExportSourceField,
  type TaxSoftware,
} from "@/lib/tax-software-export";

function softwareLabel(software: TaxSoftware) {
  return software === "proseries" ? "ProSeries" : "Drake";
}

export function TaxSoftwareExportPanel({
  jobId,
  hasCurrentApproval,
  sourceFields,
}: {
  jobId: string;
  hasCurrentApproval: boolean;
  sourceFields: TaxExportSourceField[];
}) {
  const software: TaxSoftware[] = ["proseries", "drake"];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-sm font-semibold text-blue-600">Preparation handoff</p>
        <h2 className="mt-1 font-semibold text-slate-950">Tax software export</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Create an audited, reviewer-approved field handoff for ProSeries or Drake.
          This is a reviewable mapping export, not a claim that either vendor accepts a
          proprietary direct-import file. Every download is logged with an audit ID and
          SHA-256 checksum.
        </p>
      </div>

      {!hasCurrentApproval ? (
        <div className="px-5 py-8">
          <p className="text-sm font-semibold text-slate-900">Reviewer approval required</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Complete the current return review before any taxpayer source values can be exported.
          </p>
        </div>
      ) : sourceFields.length === 0 ? (
        <div className="px-5 py-8">
          <p className="text-sm font-semibold text-slate-900">No approved source values</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Review source documents and accept reviewed extraction fields before creating a tax-software handoff.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {software.map((target) => {
            const mapped = buildTaxSoftwareExport(target, sourceFields);
            const mappedPercent = Math.round(
              (mapped.mappedCount / Math.max(1, mapped.rows.length)) * 100
            );

            return (
              <div key={target} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">{softwareLabel(target)}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Canonical W-2, 1099-INT, 1099-DIV, 1099-NEC, and 1099-R mapping pack.
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {mappedPercent}% mapped
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-slate-50 px-3 py-3">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">Fields</dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-950">{mapped.rows.length}</dd>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-3">
                    <dt className="text-[11px] uppercase tracking-wide text-emerald-600">Mapped</dt>
                    <dd className="mt-1 text-lg font-semibold text-emerald-700">{mapped.mappedCount}</dd>
                  </div>
                  <div className="rounded-xl bg-amber-50 px-3 py-3">
                    <dt className="text-[11px] uppercase tracking-wide text-amber-600">Manual</dt>
                    <dd className="mt-1 text-lg font-semibold text-amber-700">{mapped.unmappedCount}</dd>
                  </div>
                </dl>

                {mapped.unmappedCount > 0 && (
                  <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    Unmapped fields are kept in the export and marked for manual mapping; they are never silently discarded.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <a
                    href={`/dashboard/work/${jobId}/export?software=${target}&format=csv`}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Download CSV
                  </a>
                  <a
                    href={`/dashboard/work/${jobId}/export?software=${target}&format=json`}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Download JSON
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
