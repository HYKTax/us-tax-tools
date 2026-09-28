"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ClientContactInput = {
  clientId: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  country?: string;
  preferredContactMethod: "portal" | "email" | "phone";
};

export async function updateClientContact(
  input: ClientContactInput
): Promise<{ error?: string; success?: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_client_contact_details", {
    p_client_id: input.clientId,
    p_phone: input.phone?.trim() || null,
    p_address_line1: input.addressLine1?.trim() || null,
    p_address_line2: input.addressLine2?.trim() || null,
    p_city: input.city?.trim() || null,
    p_state_region: input.stateRegion?.trim() || null,
    p_postal_code: input.postalCode?.trim() || null,
    p_country: input.country?.trim() || null,
    p_preferred_contact_method: input.preferredContactMethod,
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/profile");
  revalidatePath("/portal");
  revalidatePath(`/dashboard/clients/${input.clientId}`);
  revalidatePath("/dashboard/clients");

  return { success: true };
}
