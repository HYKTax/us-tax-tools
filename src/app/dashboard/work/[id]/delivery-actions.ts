"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { scheduleNotificationEmails } from "@/lib/notifications";

type DeliveryActionResult = {
  success?: boolean;
  error?: string;
  message?: string;
};

const MAX_RETURN_COPY_BYTES = 20 * 1024 * 1024;

function safeFileName(name: string) {
  const cleaned = name
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 140) || "final-return.pdf";
}

export async function uploadReturnCopy(
  jobId: string,
  formData: FormData
): Promise<DeliveryActionResult> {
  const profile = await getCurrentProfile();

  if (!profile || !hasStaffPermission(profile, "documents.manage")) {
    return { error: "Your role cannot upload final return documents." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Choose a PDF file." };
  }
  if (file.type !== "application/pdf") {
    return { error: "Final return copies must be PDF files." };
  }
  if (file.size <= 0 || file.size > MAX_RETURN_COPY_BYTES) {
    return { error: "Choose a PDF no larger than 20 MB." };
  }

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("tax_return_jobs")
    .select("id, firm_id, client_id, review_version, tax_year, return_type")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job || job.firm_id !== profile.firm_id) {
    return { error: "Tax return not found." };
  }

  const { data: approval } = await supabase
    .from("tax_return_reviews")
    .select("id")
    .eq("tax_return_job_id", job.id)
    .eq("return_version", job.review_version)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!approval) {
    return {
      error:
        "Current reviewer approval is required before uploading a final return copy.",
    };
  }

  const fileName = safeFileName(file.name);
  const storagePath = [
    job.firm_id,
    job.client_id,
    "return-copies",
    job.id,
    crypto.randomUUID() + "-" + fileName,
  ].join("/");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("client-documents")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return { error: "The final return PDF could not be uploaded." };
  }

  // The admin insert is intentional: the return copy is already human-reviewed
  // output, not a source document. The caller and same-firm job were verified
  // above, and the row remains private until the controlled release RPC.
  const admin = createAdminClient();
  const { data: document, error: insertError } = await admin
    .from("documents")
    .insert({
      firm_id: job.firm_id,
      client_id: job.client_id,
      tax_return_job_id: job.id,
      uploaded_by: profile.id,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: file.size,
      status: "reviewed",
      document_kind: "return_copy",
      client_visible: false,
    })
    .select("id")
    .single();

  if (insertError || !document) {
    await admin.storage.from("client-documents").remove([storagePath]);
    return { error: "The uploaded PDF could not be attached to this return." };
  }

  await supabase.from("audit_log").insert({
    firm_id: profile.firm_id,
    actor_id: profile.id,
    action: "document.return_copy_uploaded",
    target_type: "document",
    target_id: document.id,
    metadata: {
      tax_return_job_id: job.id,
      tax_year: job.tax_year,
      return_type: job.return_type,
    },
  });

  revalidatePath(`/dashboard/work/${job.id}`);
  revalidatePath("/dashboard/documents");

  return {
    success: true,
    message:
      "Final return PDF uploaded privately. Release it after the return is accepted or completed.",
  };
}

export async function setReturnCopyVisibility(input: {
  documentId: string;
  jobId: string;
  clientId: string;
  visible: boolean;
}): Promise<DeliveryActionResult> {
  const profile = await getCurrentProfile();

  if (!profile || !hasStaffPermission(profile, "returns.review")) {
    return { error: "Your role cannot release final return documents." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_return_copy_visibility", {
    p_document_id: input.documentId,
    p_visible: input.visible,
  });

  if (error) {
    return { error: error.message };
  }

  scheduleNotificationEmails();

  revalidatePath(`/dashboard/work/${input.jobId}`);
  revalidatePath(`/dashboard/clients/${input.clientId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/returns");

  return {
    success: true,
    message: input.visible
      ? "Final return copy released to the client."
      : "Final return copy withdrawn from the client portal.",
  };
}
