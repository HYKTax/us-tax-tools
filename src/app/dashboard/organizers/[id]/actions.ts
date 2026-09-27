"use server";

import { scheduleNotificationEmails } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

export async function markReviewed(organizerId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "organizers.review")) {
    return { error: "Your role cannot review organizers." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_organizer", {
    p_organizer_id: organizerId,
  });

  if (error) {
    return { error: error.message };
  }

  scheduleNotificationEmails(organizerId);
  revalidatePath(`/dashboard/organizers/${organizerId}`);
  return {};
}

export async function requestChanges(organizerId: string, reason: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "organizers.review")) {
    return { error: "Your role cannot review organizers." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_organizer_changes", { p_organizer_id: organizerId, p_reason: reason });
  if (error) return { error: error.message };
  scheduleNotificationEmails(organizerId);
  revalidatePath(`/dashboard/organizers/${organizerId}`);
  revalidatePath(`/portal/organizers/${organizerId}`);
  return {};
}
