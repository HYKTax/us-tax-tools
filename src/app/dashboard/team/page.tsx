import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InviteStaffForm } from "./invite-staff-form";
import {
  PendingInvitationControls,
  StaffMemberControls,
} from "./staff-member-controls";

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  role: "firm_admin" | "firm_staff";
  is_active: boolean;
  created_at: string;
};

type InvitationRow = {
  id: string;
  email: string;
  full_name: string;
  role: "firm_admin" | "firm_staff";
  status: "invited" | "accepted" | "revoked";
  auth_user_id: string | null;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function roleLabel(role: string) {
  return role === "firm_admin" ? "Firm admin" : "Staff";
}

function statusBadge(active: boolean, invitationStatus?: string | null) {
  if (!active) return { label: "Disabled", classes: "bg-slate-100 text-slate-600" };
  if (invitationStatus === "invited") return { label: "Invited", classes: "bg-amber-50 text-amber-700" };
  return { label: "Active", classes: "bg-emerald-50 text-emerald-700" };
}

export default async function TeamPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/auth/access-disabled");
  if (profile.role !== "firm_admin") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: staff, error: staffError },
    { data: invitations, error: invitationError },
    { data: jobs },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, created_at")
      .eq("firm_id", profile.firm_id)
      .in("role", ["firm_admin", "firm_staff"])
      .order("full_name"),
    supabase
      .from("staff_invitations")
      .select("id, email, full_name, role, status, auth_user_id, invited_at, accepted_at, revoked_at")
      .eq("firm_id", profile.firm_id)
      .order("invited_at", { ascending: false }),
    supabase
      .from("tax_return_jobs")
      .select("id, preparer_id, reviewer_id, status")
      .not("status", "in", '("accepted","completed")'),
  ]);

  const staffRows = (staff ?? []) as StaffRow[];
  const invitationRows = (invitations ?? []) as InvitationRow[];
  const invitationByUserId = new Map(
    invitationRows
      .filter((invitation) => invitation.auth_user_id)
      .map((invitation) => [invitation.auth_user_id as string, invitation])
  );

  const preparationCounts = new Map<string, number>();
  const reviewCounts = new Map<string, number>();

  for (const job of jobs ?? []) {
    if (job.preparer_id) {
      preparationCounts.set(job.preparer_id, (preparationCounts.get(job.preparer_id) ?? 0) + 1);
    }
    if (job.reviewer_id) {
      reviewCounts.set(job.reviewer_id, (reviewCounts.get(job.reviewer_id) ?? 0) + 1);
    }
  }

  const pendingInvitations = invitationRows.filter(
    (invitation) => invitation.status === "invited" && !invitation.auth_user_id
  );
  const activeCount = staffRows.filter((member) => member.is_active).length;
  const adminCount = staffRows.filter(
    (member) => member.is_active && member.role === "firm_admin"
  ).length;
  const invitedCount = invitationRows.filter((invitation) => invitation.status === "invited").length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Firm administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Team</h1>
        <p className="mt-2 text-slate-500">
          Invite staff, control firm access, and manage who can prepare or review returns.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active team members</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{activeCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Firm admins</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{adminCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Invitations awaiting acceptance</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{invitedCount}</p>
        </div>
      </section>

      {(staffError || invitationError) && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {staffError?.message ?? invitationError?.message ?? "Unable to load team information."}
        </p>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr_0.58fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Team members</h2>
            <p className="mt-1 text-sm text-slate-500">
              Staff appear in preparer and reviewer dropdowns while their access is active.
            </p>
          </div>

          {staffRows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No staff profiles found.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {staffRows.map((member) => {
                const invitation = invitationByUserId.get(member.id);
                const status = statusBadge(member.is_active, invitation?.status);
                const isCurrentUser = member.id === profile.id;

                return (
                  <div key={member.id} className="px-5 py-5">
                    <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-950">{member.full_name}</p>
                          {isCurrentUser && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                              You
                            </span>
                          )}
                          <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + status.classes}>
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                            {roleLabel(member.role)}
                          </span>
                          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                            {preparationCounts.get(member.id) ?? 0} open preparation assignment{(preparationCounts.get(member.id) ?? 0) === 1 ? "" : "s"}
                          </span>
                          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                            {reviewCounts.get(member.id) ?? 0} open review assignment{(reviewCounts.get(member.id) ?? 0) === 1 ? "" : "s"}
                          </span>
                        </div>
                        {invitation?.status === "invited" && (
                          <p className="mt-2 text-xs text-amber-700">
                            Invitation sent {new Date(invitation.invited_at).toLocaleDateString()} · awaiting first sign-in
                          </p>
                        )}
                        {invitation?.accepted_at && (
                          <p className="mt-2 text-xs text-slate-400">
                            Access accepted {new Date(invitation.accepted_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      <StaffMemberControls
                        profileId={member.id}
                        initialRole={member.role}
                        initialActive={member.is_active}
                        isCurrentUser={isCurrentUser}
                        invitationId={invitation?.id ?? null}
                        invitationStatus={invitation?.status ?? null}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-950">Invite staff</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            New team members receive a secure email invitation and join this firm automatically.
          </p>
          <div className="mt-5">
            <InviteStaffForm />
          </div>
        </section>
      </section>

      {pendingInvitations.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
            <h2 className="font-semibold text-amber-950">Invitation records needing attention</h2>
            <p className="mt-1 text-sm text-amber-800">
              These invitations do not yet have an authentication account attached.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{invitation.full_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {invitation.email} · {roleLabel(invitation.role)} · invited {new Date(invitation.invited_at).toLocaleString()}
                  </p>
                </div>
                <PendingInvitationControls invitationId={invitation.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-slate-950">Permission model</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Firm admins manage team access and roles. Firm staff can work with clients, organizers, documents, messages, and tax returns, but cannot add administrators or change another staff member&apos;s access.
        </p>
      </section>
    </div>
  );
}
