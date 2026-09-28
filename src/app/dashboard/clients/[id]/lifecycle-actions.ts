"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

export async function setClientArchived(
  clientId: string,
  archived: boolean
): Promise<{ error?: string; success?: boolean; status?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot change client lifecycle status." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_client_archived", {
    p_client_id: clientId,
    p_archived: archived,
  });

  if (error || !data) {
    return { error: error?.message ?? "Client status could not be updated." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);

  return {
    success: true,
    status: data.status,
  };
}
