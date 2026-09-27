"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { authEmailFailure } from "@/lib/auth-email-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type TeamActionResult = {
  error?: string;
  success?: boolean;
  message?: string;
  cooldownSeconds?: number;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function inviteStaff(input: {
  fullName: string;
  email: string;
  role: "firm_admin" | "firm_staff";
}): Promise<TeamActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "firm_admin" || !profile.is_active) {
    return { error: "Only an active firm administrator can invite staff." };
  }

  const fullName = input.fullName.trim();
  const email = normalizeEmail(input.email);
  const role = input.role;

  if (!fullName) return { error: "Enter the staff member's name." };
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (!["firm_admin", "firm_staff"].includes(role)) return { error: "Choose a valid staff role." };

  const supabase = await createClient();

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("firm_id", profile.firm_id)
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return {
      error: existingProfile.is_active
        ? "A staff account with this email already exists. Use Send access link instead."
        : "A disabled staff account with this email already exists. Enable it before sending access.",
    };
  }

  const { data: existingInvitation } = await supabase
    .from("staff_invitations")
    .select("id")
    .eq("firm_id", profile.firm_id)
    .eq("email", email)
    .maybeSingle();

  let invitationId: string;

  if (existingInvitation) {
    const { data: updated, error: updateError } = await supabase
      .from("staff_invitations")
      .update({
        full_name: fullName,
        role,
        status: "invited",
        invited_by: profile.id,
        invited_at: new Date().toISOString(),
        accepted_at: null,
        revoked_at: null,
      })
      .eq("id", existingInvitation.id)
      .select("id")
      .single();

    if (updateError || !updated) {
      return { error: updateError?.message ?? "Unable to refresh the invitation." };
    }
    invitationId = updated.id;
  } else {
    const { data: created, error: insertError } = await supabase
      .from("staff_invitations")
      .insert({
        firm_id: profile.firm_id,
        email,
        full_name: fullName,
        role,
        invited_by: profile.id,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return { error: insertError?.message ?? "Unable to create the invitation." };
    }
    invitationId = created.id;
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      firm_id: profile.firm_id,
      role,
      full_name: fullName,
      staff_invitation_id: invitationId,
    },
    redirectTo: siteUrl + "/auth/confirm?next=/dashboard",
  });

  if (inviteError) {
    const failure = authEmailFailure(inviteError, "staff");
    revalidatePath("/dashboard/team");
    return {
      error:
        failure.error ??
        "The staff record was prepared, but the invitation email could not be sent.",
      cooldownSeconds: failure.cooldownSeconds,
    };
  }

  await supabase.from("audit_log").insert({
    firm_id: profile.firm_id,
    actor_id: profile.id,
    action: "staff.invited",
    target_type: "staff_invitation",
    target_id: invitationId,
    metadata: { email, role },
  });

  revalidatePath("/dashboard/team");
  return {
    success: true,
    message: "Invitation sent to " + email + ".",
    cooldownSeconds: 60,
  };
}

export async function sendStaffAccessLink(profileId: string): Promise<TeamActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "firm_admin" || !profile.is_active) {
    return { error: "Only an active firm administrator can send staff access links." };
  }

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id, email, role, is_active, firm_id")
    .eq("id", profileId)
    .maybeSingle();

  if (
    targetError ||
    !target ||
    target.firm_id !== profile.firm_id ||
    !["firm_admin", "firm_staff"].includes(target.role)
  ) {
    return { error: "Staff member not found." };
  }

  if (!target.is_active) {
    return { error: "Enable this staff account before sending an access link." };
  }

  await supabase
    .from("staff_invitations")
    .update({
      status: "invited",
      invited_at: new Date().toISOString(),
      revoked_at: null,
    })
    .eq("auth_user_id", target.id)
    .eq("status", "revoked");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email: target.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: siteUrl + "/auth/confirm?next=/dashboard",
    },
  });

  if (error) return authEmailFailure(error, "staff");

  await supabase.from("audit_log").insert({
    firm_id: profile.firm_id,
    actor_id: profile.id,
    action: "staff.access_link_sent",
    target_type: "profile",
    target_id: target.id,
  });

  revalidatePath("/dashboard/team");
  return { success: true, message: "Access link sent to " + target.email + ".", cooldownSeconds: 60 };
}

export async function updateStaffMember(input: {
  profileId: string;
  role: "firm_admin" | "firm_staff";
  isActive: boolean;
}): Promise<TeamActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "firm_admin" || !profile.is_active) {
    return { error: "Only an active firm administrator can manage staff." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_staff", {
    p_profile_id: input.profileId,
    p_role: input.role,
    p_is_active: input.isActive,
  });

  if (error) return { error: error.message };

  if (input.isActive) {
    await supabase
      .from("staff_invitations")
      .update({
        status: "invited",
        invited_at: new Date().toISOString(),
        revoked_at: null,
      })
      .eq("auth_user_id", input.profileId)
      .eq("status", "revoked");
  }

  revalidatePath("/dashboard/team");
  return { success: true, message: input.isActive ? "Staff access updated." : "Staff access disabled." };
}

export async function revokeStaffInvitation(invitationId: string): Promise<TeamActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "firm_admin" || !profile.is_active) {
    return { error: "Only an active firm administrator can revoke staff invitations." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_staff_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/team");
  return { success: true, message: "Invitation revoked." };
}
