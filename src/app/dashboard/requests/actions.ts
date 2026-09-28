"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { scheduleNotificationEmails } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type Result = { error?: string; success?: boolean; message?: string };

export async function createDocumentRequest(input: {
  clientId: string;
  title: string;
  details?: string;
  dueDate?: string;
}): Promise<Result> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "documents.manage")) {
    return { error: "Your role cannot create document requests." };
  }

  const title = input.title.trim();
  const details = input.details?.trim() || null;

  if (!title || title.length > 240) {
    return { error: "Enter a request title up to 240 characters." };
  }

  if (details && details.length > 5000) {
    return { error: "Request details must be 5000 characters or fewer." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_document_request", {
    p_client_id: input.clientId,
    p_title: title,
    p_details: details,
    p_due_date: input.dueDate || null,
  });

  if (error) return { error: error.message };

  scheduleNotificationEmails();
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/clients/${input.clientId}`);

  return { success: true, message: "Document request sent." };
}

export async function cancelDocumentRequest(
  requestId: string,
  clientId: string
): Promise<Result> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "documents.manage")) {
    return { error: "Your role cannot manage document requests." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_document_request", {
    p_request_id: requestId,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/clients/${clientId}`);

  return { success: true, message: "Document request cancelled." };
}
