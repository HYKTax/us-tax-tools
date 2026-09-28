"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

export type FirmSettingsResult = {
  error?: string;
  success?: boolean;
  message?: string;
};

export async function updateFirmSettings(input: {
  name: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  portalWelcomeMessage: string;
}): Promise<FirmSettingsResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "team.manage")) {
    return { error: "Only a Firm Admin can update firm settings." };
  }

  const name = input.name.trim();
  if (!name || name.length > 160) {
    return { error: "Enter a firm name up to 160 characters." };
  }

  if (input.portalWelcomeMessage.trim().length > 1000) {
    return { error: "Portal welcome message must be 1000 characters or fewer." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_firm_settings", {
    p_name: name,
    p_support_email: input.supportEmail.trim(),
    p_support_phone: input.supportPhone.trim(),
    p_website_url: input.websiteUrl.trim(),
    p_portal_welcome_message: input.portalWelcomeMessage.trim(),
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/portal");
  revalidatePath("/portal", "layout");

  return {
    success: true,
    message: "Firm and client portal settings updated.",
  };
}
