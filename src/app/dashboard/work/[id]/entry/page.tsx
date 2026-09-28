import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { createClient } from "@/lib/supabase/server";
import {
  buildTaxSoftwareExport,
  type TaxExportSourceField,
  type TaxSoftware,
} from "@/lib/tax-software-export";
import { TaxEntryAssistant } from "./entry-assistant";

type SourceRow = {
  document_id: string;
  field_name: string;
  field_label: string;
  value: string;
  confidence: number | null;
  document:
    | {
        file_name: string;
        document_extractions:
          | { document_type: string | null; tax_year: number | null }
          | Array<{ document_type: string | null; tax_year: number | null }>
          | null;
      }
    | null;
};

export default async function TaxEntryAssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ software?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.manage")) notFound();

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const software: TaxSoftware = query.software === "drake" ? "drake" : "proseries";
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("tax_return_jobs")
    .select(
      "id, firm_id, tax_year, return_type, review_version, clients(primary_contact_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (jobError || !job || job.firm_id !== profile.firm_id) notFound();

  const [{ data: approval }, { data: sourceRows, error: sourceError }] =
    await Promise.all([
      supabase
        .from("tax_return_reviews")
        .select("id")
        .eq("tax_return_job_id", job.id)
        .eq("return_version", job.review_version)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("tax_return_source_values")
        .select(
          "document_id, field_name, field_label, value, confidence, document:documents!tax_return_source_values_document_id_fkey(file_name, document_extractions(document_type,tax_year))"
        )
        .eq("tax_return_job_id", job.id)
        .order("document_id")
        .order("field_name"),
    ]);

  if (sourceError) {
    throw new Error("Unable to load approved source data.");
  }

  const client = job.clients as unknown as { primary_contact_name: string } | null;
  const typedRows = (sourceRows ?? []) as unknown as SourceRow[];

  const sourceFields: TaxExportSourceField[] = typedRows.map((row) => {
    const rawExtraction = row.document?.document_extractions;
    const extraction = Array.isArray(rawExtraction) ? rawExtraction[0] : rawExtraction;

    return {
      documentId: row.document_id,
      fileName: row.document?.file_name ?? "Source document",
      documentType: extraction?.document_type ?? null,
      fieldName: row.field_name,
      fieldLabel: row.field_label,
      value: row.value,
      confidence: row.confidence,
    };
  });

  const mapped = buildTaxSoftwareExport(software, sourceFields);
  const softwareLabel = software === "proseries" ? "ProSeries" : "Drake";

  return (
    <div className="flex flex-col gap-7">
      <section>
        <a
          href={"/dashboard/work/" + job.id}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Return workspace
        </a>
        <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold text-blue-600">Tax software entry assistant</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
              {job.tax_year} {job.return_type} · {client?.primary_contact_name ?? "Client"}
            </h1>
            <p className="mt-2 max-w-3xl text-slate-500">
              Guided entry uses only human-approved source values from the currently approved return version.
            </p>
          </div>

          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <a
              href={`/dashboard/work/${job.id}/entry?software=proseries`}
              className={
                "rounded-lg px-3 py-2 text-sm font-semibold " +
                (software === "proseries"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50")
              }
            >
              ProSeries
            </a>
            <a
              href={`/dashboard/work/${job.id}/entry?software=drake`}
              className={
                "rounded-lg px-3 py-2 text-sm font-semibold " +
                (software === "drake"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50")
              }
            >
              Drake
            </a>
          </div>
        </div>
      </section>

      {!approval ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-950">Current reviewer approval required</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            The entry assistant stays locked until the current return version is formally approved.
          </p>
        </section>
      ) : !mapped.rows.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-950">No approved source data</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Accept reviewed document extraction fields into the return before starting software entry.
          </p>
        </section>
      ) : (
        <TaxEntryAssistant rows={mapped.rows} softwareLabel={softwareLabel} />
      )}
    </div>
  );
}
