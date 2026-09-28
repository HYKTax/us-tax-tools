"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

export async function assignClientTagBatch(input: {
  clientIds: string[];
  name: string;
}): Promise<{
  error?: string;
  success?: boolean;
  assigned?: number;
  skipped?: number;
}> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot manage client tags." };
  }

  const ids = Array.from(new Set(input.clientIds)).filter(Boolean);
  const name = input.name.trim();

  if (ids.length === 0) return { error: "Select at least one client." };
  if (ids.length > 500) return { error: "Select no more than 500 clients." };
  if (!name || name.length > 40) return { error: "Enter a tag between 1 and 40 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_client_tag_batch", {
    p_client_ids: ids,
    p_name: name,
  });

  if (error) return { error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const assigned = Number(row?.assigned_count ?? 0);
  const skipped = Number(row?.skipped_count ?? 0);

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/organizers/batch");
  revalidatePath("/dashboard/work/batch");
  revalidatePath("/dashboard/requests/batch");

  return { success: true, assigned, skipped };
}
