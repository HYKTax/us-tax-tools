import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  staffRoleLabel,
  type StaffOperationalRole,
} from "@/lib/staff-permissions";
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
  staff_role: StaffOperationalRole;
  is_active: boolean;
  created_at: string;
};

type InvitationRow = {
  id: string;
  email: string;
  full_name: string;
  role: "firm_admin" | "firm_staff";
  staff_role: StaffOperationalRole;
  status: "invited" | "accepted" | "revoked";
  auth_user_id: string | null;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function statusBadge(active: boolean, invitationStatus?: string | null) {
  if (!active) return { label: "Disabled", classes: "bg-slate-100 text-slate-600" };
  if (invitationStatus === "invited") return { label: "Invited", classes: "bg-amber-50 text-amber-700" };
  return { label: "Active", classes: "bg-emerald-50 text-emerald-700" };
}

const permissionRows = [
  { label: "Manage team / roles", admin: true, manager: false, reviewer: false, preparer: false },
  { label: "View firm activity log", admin: true, manager: true, reviewer: false, preparer: false },
  { label: "Create & manage clients", admin: true, manager: true, reviewer: false, preparer: true },
  { label: "Send / edit organizers", admin: true, manager: true, reviewer: false, preparer: true },
  { label: "Review organizers", admin: true, manager: true, reviewer: true, preparer: false },
  { label: "Upload / link documents", admin: true, manager: true, reviewer: false, preparer: true },
  { label: "Run AI extraction", admin: true, manager: true, reviewer: true, preparer: true },
  { label: "Approve AI / document data", admin: true, manager: true, reviewer: true, preparer: false },
  { label: "Manage tax-return workflow", admin: true, manager: true, reviewer: true, preparer: true },
  { label: "Approve return source data", admin: true, manager: true, reviewer: true, preparer: false },
  { label: "Manage organizer templates", admin: true, manager: true, reviewer: false, preparer: false },
] as const;

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
      .select("id, full_name, email, role, staff_role, is_active, created_at")
      .eq("firm_id", profile.firm_id)
      .in("role", ["firm_admin", "firm_staff"])
      .order("full_name"),
    supabase
      .from("staff_invitations")
      .select("id, email, full_name, role, staff_role, status, auth_user_id, invited_at, accepted_at, revoked_at")
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
    (member) => member.is_active && member.staff_role === "admin"
  ).length;
  const invitedCount = invitationRows.filter((invitation) => invitation.status === "invited").length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Firm administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Team & permissions</h1>
        <p className="mt-2 text-slate-500">
          Invite staff, assign operational roles, and control who can prepare, review, approve, and administer firm work.
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
              Preparer and reviewer eligibility now follows each person&apos;s operational role.
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
                          <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 font-semibold text-blue-700">
                            {staffRoleLabel(member.staff_role)}
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
                        initialStaffRole={member.staff_role}
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
            New team members receive a secure passwordless invitation with their role already attached.
          </p>
          <div className="mt-5">
            <InviteStaffForm />
          </div>
        </section>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Role permissions</h2>
          <p className="mt-1 text-sm text-slate-500">
            These permissions are enforced by Supabase policies and protected RPCs, not only by the interface.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Capability</th>
                <th className="px-5 py-3">Admin</th>
                <th className="px-5 py-3">Manager</th>
                <th className="px-5 py-3">Reviewer</th>
                <th className="px-5 py-3">Preparer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissionRows.map((row) => (
                <tr key={row.label}>
                  <td className="px-5 py-3 font-medium text-slate-800">{row.label}</td>
                  {(["admin", "manager", "reviewer", "preparer"] as const).map((role) => (
                    <td key={role} className="px-5 py-3">
                      <span className={row[role] ? "font-semibold text-emerald-700" : "text-slate-300"}>
                        {row[role] ? "✓" : "—"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                    {invitation.email} · {staffRoleLabel(invitation.staff_role)} · invited {new Date(invitation.invited_at).toLocaleString()}
                  </p>
                </div>
                <PendingInvitationControls invitationId={invitation.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-slate-950">Separation of duties</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Preparers can collect documents, run extraction, and prepare returns, but they cannot approve AI-extracted tax data. Reviewers and Managers can perform the human-review and approval steps. Only Firm Admins can manage team access.
        </p>
      </section>
    </div>
  );
}
