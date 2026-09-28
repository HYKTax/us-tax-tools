import { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { createClient } from "@/lib/supabase/server";
import {
  buildTaxSoftwareExport,
  taxSoftwareExportCsv,
  type TaxExportSourceField,
  type TaxSoftware,
} from "@/lib/tax-software-export";

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
          | {
              document_type: string | null;
              tax_year: number | null;
            }
          | Array<{
              document_type: string | null;
              tax_year: number | null;
            }>
          | null;
      }
    | null;
};

function safeFilePart(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "client"
  );
}

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.manage")) {
    return errorResponse("You are not authorized to export return data.", 403);
  }

  const { id } = await context.params;
  const softwareParam = request.nextUrl.searchParams.get("software");
  const format = request.nextUrl.searchParams.get("format") ?? "csv";

  if (softwareParam !== "proseries" && softwareParam !== "drake") {
    return errorResponse("Choose ProSeries or Drake.", 400);
  }
  if (format !== "csv" && format !== "json") {
    return errorResponse("Choose CSV or JSON export format.", 400);
  }

  const software: TaxSoftware = softwareParam;
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("tax_return_jobs")
    .select(
      "id, firm_id, tax_year, return_type, review_version, status, clients(primary_contact_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (jobError || !job || job.firm_id !== profile.firm_id) {
    return errorResponse("Tax return not found.", 404);
  }

  const client = job.clients as unknown as { primary_contact_name: string } | null;

  const [{ data: approval }, { data: activeReview }, { data: sourceRows, error: sourceError }] =
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
        .from("tax_return_reviews")
        .select("id")
        .eq("tax_return_job_id", job.id)
        .eq("status", "requested")
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

  if (!approval || activeReview) {
    return errorResponse(
      "A current completed reviewer approval is required before tax-software export.",
      409
    );
  }

  if (sourceError) {
    return errorResponse("Approved return data could not be loaded.", 500);
  }

  const typedRows = (sourceRows ?? []) as unknown as SourceRow[];
  if (!typedRows.length) {
    return errorResponse("There is no approved source data to export.", 409);
  }

  const sourceFields: TaxExportSourceField[] = typedRows.map((row) => {
    const rawExtraction = row.document?.document_extractions;
    const extraction = Array.isArray(rawExtraction)
      ? rawExtraction[0]
      : rawExtraction;

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

  const exportResult = buildTaxSoftwareExport(software, sourceFields);
  const clientName = client?.primary_contact_name ?? "Client";

  const { error: auditError } = await supabase.from("audit_log").insert({
    firm_id: profile.firm_id,
    actor_id: profile.id,
    action: "tax_return.export_generated",
    target_type: "tax_return_job",
    target_id: job.id,
    metadata: {
      software,
      format,
      tax_year: job.tax_year,
      return_type: job.return_type,
      review_version: job.review_version,
      field_count: exportResult.rows.length,
      mapped_count: exportResult.mappedCount,
      unmapped_count: exportResult.unmappedCount,
    },
  });

  if (auditError) {
    return errorResponse(
      "The export could not be audited, so no tax data was released.",
      500
    );
  }

  const baseName = [
    job.tax_year,
    job.return_type,
    safeFilePart(clientName),
    software,
    "reviewed-source-data",
  ].join("-");

  const commonHeaders = {
    "Cache-Control": "no-store, private",
    "Content-Disposition": `attachment; filename="${baseName}.${format}"`,
    "X-Content-Type-Options": "nosniff",
  };

  if (format === "json") {
    return new Response(
      JSON.stringify(
        {
          software,
          export_kind: "reviewed_source_data_handoff",
          direct_vendor_import: false,
          tax_year: job.tax_year,
          return_type: job.return_type,
          client_name: clientName,
          review_version: job.review_version,
          mapped_count: exportResult.mappedCount,
          unmapped_count: exportResult.unmappedCount,
          rows: exportResult.rows,
        },
        null,
        2
      ),
      {
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }

  const csv = taxSoftwareExportCsv({
    software,
    taxYear: job.tax_year,
    returnType: job.return_type,
    clientName,
    reviewVersion: job.review_version,
    rows: exportResult.rows,
  });

  return new Response(csv, {
    headers: {
      ...commonHeaders,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
