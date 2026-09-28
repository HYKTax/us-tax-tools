"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

export type EngagementActionResult = {
  success?: boolean;
  error?: string;
};

export async function createEngagementTemplate(input: {
  name: string;
  title: string;
  body: string;
}): Promise<EngagementActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "templates.manage")) {
    return { error: "Your role cannot manage engagement templates." };
  }

  const name = input.name.trim();
  const title = input.title.trim();
  const body = input.body.trim();

  if (!name || name.length > 160) return { error: "Enter a template name up to 160 characters." };
  if (!title || title.length > 240) return { error: "Enter a title up to 240 characters." };
  if (!body || body.length > 30000) return { error: "Enter engagement text up to 30,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("engagement_templates").insert({
    firm_id: profile.firm_id,
    name,
    title,
    body,
    created_by: profile.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/engagements");
  return { success: true };
}

export async function setEngagementTemplateActive(
  templateId: string,
  active: boolean
): Promise<EngagementActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "templates.manage")) {
    return { error: "Your role cannot manage engagement templates." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engagement_templates")
    .update({ is_active: active })
    .eq("id", templateId)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "Template could not be updated." };

  revalidatePath("/dashboard/engagements");
  return { success: true };
}

export async function sendEngagementToClient(
  clientId: string,
  templateId: string
): Promise<EngagementActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot send client engagements." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_client_engagement", {
    p_client_id: clientId,
    p_template_id: templateId,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/engagements");
  revalidatePath("/dashboard/clients/" + clientId);
  revalidatePath("/portal/engagements");
  return { success: true };
}

export async function withdrawEngagement(
  engagementId: string,
  clientId: string
): Promise<EngagementActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot manage client engagements." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_engagements")
    .update({
      status: "withdrawn",
      withdrawn_at: new Date().toISOString(),
    })
    .eq("id", engagementId)
    .eq("status", "sent")
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "Engagement could not be withdrawn." };

  revalidatePath("/dashboard/engagements");
  revalidatePath("/dashboard/clients/" + clientId);
  revalidatePath("/portal/engagements");
  return { success: true };
}

export async function acknowledgeEngagement(
  engagementId: string,
  fullName: string
): Promise<EngagementActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client" || !profile.is_active) {
    return { error: "Client account required." };
  }

  const name = fullName.trim();
  if (!name || name.length > 240) {
    return { error: "Enter your full name." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_client_engagement", {
    p_engagement_id: engagementId,
    p_name: name,
  });

  if (error) return { error: error.message };

  revalidatePath("/portal");
  revalidatePath("/portal/engagements");
  return { success: true };
}


export async function sendEngagementsBatch(input: {
  clientIds: string[];
  templateId: string;
}): Promise<EngagementActionResult & { created?: number; skipped?: number; message?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) {
    return { error: "Your role cannot send client engagements." };
  }

  const clientIds = Array.from(new Set(input.clientIds)).filter(Boolean);
  if (clientIds.length === 0) return { error: "Select at least one client." };
  if (clientIds.length > 200) return { error: "Send to no more than 200 clients at a time." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_engagements_batch", {
    p_client_ids: clientIds,
    p_template_id: input.templateId,
  });

  if (error) return { error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const created = Number(row?.created_count ?? 0);
  const skipped = Number(row?.skipped_count ?? 0);

  revalidatePath("/dashboard/engagements");
  revalidatePath("/portal/engagements");

  return {
    success: true,
    created,
    skipped,
    message:
      "Created " + created + " engagement" + (created === 1 ? "" : "s") +
      (skipped ? "; skipped " + skipped + " pending duplicate" + (skipped === 1 ? "" : "s") + "." : "."),
  };
}
