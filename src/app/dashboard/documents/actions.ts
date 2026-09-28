"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { canonicalTaxExtractionGuidance } from "@/lib/tax-software-export";

type ActionResult = { error?: string; success?: boolean; message?: string };

const supportedImages = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
  };

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  return null;
}

function extractionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      document_type: { type: "string" },
      tax_year: {
        anyOf: [{ type: "integer" }, { type: "null" }],
      },
      summary: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      fields: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            label: { type: "string" },
            value: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["name", "label", "value", "confidence"],
        },
      },
      flags: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["document_type", "tax_year", "summary", "confidence", "fields", "flags"],
  };
}

export async function runDocumentExtraction(documentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "ai.run")) {
    return { error: "Your role cannot run AI extraction." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { error: "AI extraction is not configured yet. Add OPENAI_API_KEY in Vercel first." };
  }

  const model = process.env.OPENAI_DOCUMENT_MODEL?.trim() || "gpt-5.6-luna";
  const supabase = await createClient();

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, firm_id, client_id, tax_return_job_id, document_kind, file_name, storage_path, mime_type, size_bytes")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError || !document || document.firm_id !== profile.firm_id) {
    return { error: "Document not found." };
  }

  if (document.document_kind === "return_copy") {
    return {
      error:
        "Final return copies are delivery documents and are not source documents for AI extraction.",
    };
  }

  if (document.tax_return_job_id) {
    const { data: linkedJob } = await supabase
      .from("tax_return_jobs")
      .select("id, status, review_version")
      .eq("id", document.tax_return_job_id)
      .maybeSingle();

    if (linkedJob) {
      const [{ data: activeReview }, { data: currentApproval }] = await Promise.all([
        supabase
          .from("tax_return_reviews")
          .select("id")
          .eq("tax_return_job_id", linkedJob.id)
          .eq("status", "requested")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("tax_return_reviews")
          .select("id")
          .eq("tax_return_job_id", linkedJob.id)
          .eq("return_version", linkedJob.review_version)
          .eq("status", "approved")
          .limit(1)
          .maybeSingle(),
      ]);

      if (activeReview) {
        return {
          error:
            "Resolve the active return review before re-running AI extraction on a linked source document.",
        };
      }

      if (currentApproval) {
        return {
          error:
            "This return already has current reviewer approval. Move it back to preparation before re-running AI extraction so a new review cycle is required.",
        };
      }
    }
  }

  const mimeType = document.mime_type || (document.file_name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  const supported = mimeType === "application/pdf" || supportedImages.has(mimeType);
  const admin = createAdminClient();

  if (!supported) {
    await admin.from("document_extractions").upsert(
      {
        document_id: document.id,
        status: "unsupported",
        provider: "openai",
        model,
        error_message: "Only PDF, JPEG, PNG, WebP, and GIF files are supported.",
        reviewed_by: null,
        reviewed_at: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
      { onConflict: "document_id" }
    );
    revalidatePath("/dashboard/documents");
    revalidatePath(`/dashboard/documents/${document.id}`);
    return { error: "This file type is not supported for AI extraction." };
  }

  await admin.from("document_extractions").upsert(
    {
      document_id: document.id,
      status: "pending",
      provider: "openai",
      model,
      error_message: null,
      reviewed_by: null,
      reviewed_at: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    },
    { onConflict: "document_id" }
  );

  try {
    const { data: signed, error: signedError } = await supabase.storage
      .from("client-documents")
      .createSignedUrl(document.storage_path, 5 * 60);

    if (signedError || !signed?.signedUrl) {
      throw new Error("Unable to create a secure document link.");
    }

    const documentInput =
      mimeType === "application/pdf"
        ? {
            type: "input_file",
            file_url: signed.signedUrl,
            filename: document.file_name,
          }
        : {
            type: "input_image",
            image_url: signed.signedUrl,
            detail: "high",
          };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "You extract structured facts from U.S. tax source documents for review by a tax professional. " +
                  "Never calculate tax liability or give tax advice. Never invent missing data. " +
                  "Preserve source values exactly when possible. If text is uncertain, lower the confidence and add a flag. " +
                  "Do not output full SSNs, EINs, account numbers, or other complete taxpayer identifiers; only output the last four digits when useful.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Classify this tax document and extract the important preparation fields. " +
                  canonicalTaxExtractionGuidance +
                  " Include flags for anything that a human reviewer should verify.",
              },
              documentInput,
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tax_document_extraction",
            strict: true,
            schema: extractionSchema(),
          },
        },
      }),
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      const errorPayload = payload as { error?: { message?: string } };
      throw new Error(errorPayload.error?.message || `AI extraction failed with status ${response.status}.`);
    }

    const outputText = extractResponseText(payload);
    if (!outputText) throw new Error("AI extraction returned no structured output.");

    const parsed = JSON.parse(outputText) as {
      document_type: string;
      tax_year: number | null;
      summary: string;
      confidence: number;
      fields: Array<{ name: string; label: string; value: string; confidence: number }>;
      flags: string[];
    };

    if (
      !parsed ||
      typeof parsed.document_type !== "string" ||
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.fields) ||
      !Array.isArray(parsed.flags) ||
      typeof parsed.confidence !== "number"
    ) {
      throw new Error("AI extraction returned an invalid result.");
    }

    const { error: updateError } = await admin
      .from("document_extractions")
      .update({
        status: "completed",
        document_type: parsed.document_type,
        tax_year: parsed.tax_year,
        fields: parsed.fields,
        flags: parsed.flags,
        summary: parsed.summary,
        confidence: parsed.confidence,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("document_id", document.id);

    if (updateError) throw updateError;

    await supabase.from("audit_log").insert({
      firm_id: profile.firm_id,
      actor_id: profile.id,
      action: "document.ai_extracted",
      target_type: "document",
      target_id: document.id,
      metadata: {
        document_type: parsed.document_type,
        tax_year: parsed.tax_year,
        model,
        confidence: parsed.confidence,
      },
    });

    revalidatePath("/dashboard/documents");
    revalidatePath(`/dashboard/documents/${document.id}`);
    if (document.tax_return_job_id) {
      revalidatePath(`/dashboard/work/${document.tax_return_job_id}`);
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI extraction failed.";

    await admin
      .from("document_extractions")
      .update({
        status: "failed",
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq("document_id", document.id);

    revalidatePath("/dashboard/documents");
    revalidatePath(`/dashboard/documents/${document.id}`);
    return { error: message };
  }
}

export async function markExtractionReviewed(documentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "documents.review")) {
    return { error: "Your role cannot approve extracted document data." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_extractions")
    .update({
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("document_id", documentId)
    .eq("status", "completed")
    .select("document_id")
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "Completed extraction not found." };
  }

  await supabase.from("audit_log").insert({
    firm_id: profile.firm_id,
    actor_id: profile.id,
    action: "document.ai_reviewed",
    target_type: "document",
    target_id: documentId,
  });

  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/documents/${documentId}`);
  return { success: true };
}

export async function markDocumentReviewed(documentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "documents.review")) {
    return { error: "Your role cannot review source documents." };
  }

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, tax_return_job_id")
    .eq("id", documentId)
    .maybeSingle();

  if (!document) return { error: "Document not found." };

  const { error } = await supabase.rpc("review_document", {
    p_document_id: documentId,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/documents/${documentId}`);
  if (document.tax_return_job_id) {
    revalidatePath(`/dashboard/work/${document.tax_return_job_id}`);
  }
  return { success: true };
}

export async function linkDocumentToReturn(
  documentId: string,
  taxReturnJobId: string | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "documents.manage")) {
    return { error: "Your role cannot link source documents." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ tax_return_job_id: taxReturnJobId || null })
    .eq("id", documentId)
    .select("id, tax_return_job_id")
    .maybeSingle();

  if (error || !data) return { error: error?.message ?? "Document not found." };

  await supabase.from("audit_log").insert({
    firm_id: profile.firm_id,
    actor_id: profile.id,
    action: data.tax_return_job_id ? "document.return_linked" : "document.return_unlinked",
    target_type: "document",
    target_id: documentId,
    metadata: { tax_return_job_id: data.tax_return_job_id },
  });

  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/documents/${documentId}`);
  if (data.tax_return_job_id) revalidatePath(`/dashboard/work/${data.tax_return_job_id}`);
  return { success: true };
}


export async function acceptExtractionToReturn(documentId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.review")) {
    return { error: "Your role cannot approve extracted data for a return." };
  }

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, tax_return_job_id")
    .eq("id", documentId)
    .maybeSingle();

  if (!document) return { error: "Document not found." };

  const { data: count, error } = await supabase.rpc("accept_document_extraction", {
    p_document_id: documentId,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/documents/${documentId}`);
  if (document.tax_return_job_id) {
    revalidatePath(`/dashboard/work/${document.tax_return_job_id}`);
  }

  return {
    success: true,
    message: `${count ?? 0} reviewed field${count === 1 ? "" : "s"} accepted into return data.`,
  };
}
