"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { scheduleNotificationEmails } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type BatchResult = {
  error?: string;
  success?: boolean;
  created?: number;
  skipped?: number;
  message?: string;
};

export async function sendOrganizersBatch(input: {
  clientIds: string[];
  templateId: string;
  taxYear: number;
  title: string;
}): Promise<BatchResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "organizers.manage")) {
    return { error: "Your role cannot send organizers." };
  }

  const clientIds = Array.from(new Set(input.clientIds)).filter(Boolean);
  const title = input.title.trim();

  if (clientIds.length === 0) return { error: "Select at least one client." };
  if (clientIds.length > 200) return { error: "Send no more than 200 organizers at a time." };
  if (!input.templateId) return { error: "Choose an organizer template." };
  if (!Number.isInteger(input.taxYear) || input.taxYear < 2000 || input.taxYear > 2100) {
    return { error: "Enter a valid tax year." };
  }
  if (!title || title.length > 240) {
    return { error: "Enter an organizer title up to 240 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_organizers_batch", {
    p_client_ids: clientIds,
    p_template_id: input.templateId,
    p_tax_year: input.taxYear,
    p_title: title,
  });

  if (error) return { error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const created = Number(row?.created_count ?? 0);
  const skipped = Number(row?.skipped_count ?? 0);

  scheduleNotificationEmails();
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/organizers");
  revalidatePath("/dashboard/clients");

  return {
    success: true,
    created,
    skipped,
    message:
      `Sent ${created} organizer${created === 1 ? "" : "s"}` +
      (skipped ? `; skipped ${skipped} existing organizer${skipped === 1 ? "" : "s"}.` : "."),
  };
}
