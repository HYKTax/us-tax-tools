"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type Result = { error?: string; success?: boolean };

export async function addClientTag(
  clientId: string,
  name: string
): Promise<Result> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot manage client tags." };
  }

  const value = name.trim();
  if (!value || value.length > 40) {
    return { error: "Enter a tag between 1 and 40 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_client_tag", {
    p_client_id: clientId,
    p_name: value,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { success: true };
}

export async function removeClientTag(
  clientId: string,
  tagId: string
): Promise<Result> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot manage client tags." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_client_tag", {
    p_client_id: clientId,
    p_tag_id: tagId,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { success: true };
}
