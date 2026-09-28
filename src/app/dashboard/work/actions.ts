"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { scheduleNotificationEmails } from "@/lib/notifications";

const returnTypes = new Set(["1040","1040-NR","1065","1120-S","1120","1041","990","706","709","other"]);
const statuses = new Set([
  "not_started","waiting_on_client","ready_to_prepare","preparing","review",
  "waiting_on_signature","ready_to_file","e_filed","accepted","rejected",
  "extended","completed"
]);
const priorities = new Set(["low","normal","high","urgent"]);
const extensionStatuses = new Set(["not_needed","planned","filed"]);
const efileStatuses = new Set(["not_ready","ready","transmitted","accepted","rejected"]);

export type ReturnActionResult = {
  error?: string;
  success?: boolean;
  id?: string;
  message?: string;
};

export async function createTaxReturnJob(input: {
  clientId: string;
  organizerId?: string;
  taxYear: number;
  returnType: string;
  dueDate?: string;
  preparerId?: string;
  reviewerId?: string;
}): Promise<ReturnActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.manage")) {
    return { error: "Your role cannot manage tax-return workflow." };
  }
  if (!returnTypes.has(input.returnType)) return { error: "Choose a valid return type." };
  if (!Number.isInteger(input.taxYear) || input.taxYear < 2000 || input.taxYear > 2100) {
    return { error: "Enter a valid tax year." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_return_jobs")
    .insert({
      firm_id: profile.firm_id,
      client_id: input.clientId,
      organizer_id: input.organizerId || null,
      tax_year: input.taxYear,
      return_type: input.returnType,
      due_date: input.dueDate || null,
      preparer_id: input.preparerId || null,
      reviewer_id: input.reviewerId || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Couldn't create the tax return." };

  revalidatePath("/dashboard/work");
  revalidatePath(`/dashboard/clients/${input.clientId}`);
  return { success: true, id: data.id };
}

export async function updateTaxReturnJob(input: {
  id: string;
  clientId: string;
  status: string;
  priority: string;
  dueDate?: string;
  preparerId?: string;
  reviewerId?: string;
  extensionStatus: string;
  efileStatus: string;
}): Promise<ReturnActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.manage")) {
    return { error: "Your role cannot manage tax-return workflow." };
  }
  if (!statuses.has(input.status)) return { error: "Choose a valid workflow status." };
  if (!priorities.has(input.priority)) return { error: "Choose a valid priority." };
  if (!extensionStatuses.has(input.extensionStatus)) return { error: "Choose a valid extension status." };
  if (!efileStatuses.has(input.efileStatus)) return { error: "Choose a valid e-file status." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_tax_return_job", {
    p_id: input.id,
    p_status: input.status,
    p_priority: input.priority,
    p_due_date: input.dueDate || null,
    p_preparer_id: input.preparerId || null,
    p_reviewer_id: input.reviewerId || null,
    p_extension_status: input.extensionStatus,
    p_efile_status: input.efileStatus,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work");
  revalidatePath(`/dashboard/work/${input.id}`);
  revalidatePath(`/dashboard/clients/${input.clientId}`);
  return { success: true, message: "Return workflow updated." };
}

export async function requestTaxReturnReview(
  jobId: string,
  clientId: string,
  note: string
): Promise<ReturnActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.manage")) {
    return { error: "Your role cannot request return review." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_tax_return_review", {
    p_job_id: jobId,
    p_note: note.trim() || null,
  });

  if (error) return { error: error.message };

  scheduleNotificationEmails();

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work");
  revalidatePath(`/dashboard/work/${jobId}`);
  revalidatePath(`/dashboard/clients/${clientId}`);

  return {
    success: true,
    id: typeof data === "string" ? data : undefined,
    message: "Return sent to review.",
  };
}

export async function resolveTaxReturnReview(input: {
  reviewId: string;
  jobId: string;
  clientId: string;
  decision: "approved" | "changes_requested";
  note: string;
}): Promise<ReturnActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.review")) {
    return { error: "Your role cannot resolve return reviews." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_tax_return_review", {
    p_review_id: input.reviewId,
    p_decision: input.decision,
    p_note: input.note.trim() || null,
  });

  if (error) return { error: error.message };

  scheduleNotificationEmails();

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work");
  revalidatePath(`/dashboard/work/${input.jobId}`);
  revalidatePath(`/dashboard/clients/${input.clientId}`);

  return {
    success: true,
    message:
      input.decision === "approved"
        ? "Review approved. The return is ready to file."
        : "Changes requested. The return is back in preparation.",
  };
}

export async function openTaxReturnJob(id: string) {
  redirect(`/dashboard/work/${id}`);
}
