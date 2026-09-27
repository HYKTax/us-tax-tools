"use client";

import { useState, useTransition } from "react";
import { staffRoleOptions, type StaffOperationalRole } from "@/lib/staff-permissions";
import { useEmailCooldown } from "@/lib/use-email-cooldown";
import {
  revokeStaffInvitation,
  sendStaffAccessLink,
  updateStaffMember,
} from "./actions";

export function StaffMemberControls({
  profileId,
  initialStaffRole,
  initialActive,
  isCurrentUser,
  invitationId,
  invitationStatus,
}: {
  profileId: string;
  initialStaffRole: StaffOperationalRole;
  initialActive: boolean;
  isCurrentUser: boolean;
  invitationId: string | null;
  invitationStatus: string | null;
}) {
  const [staffRole, setStaffRole] = useState(initialStaffRole);
  const [active, setActive] = useState(initialActive);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { seconds, startCooldown } = useEmailCooldown();

  const save = (nextActive = active) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateStaffMember({
        profileId,
        staffRole,
        isActive: nextActive,
      });
      if (result.success) setActive(nextActive);
      setMessage(result.error ?? result.message ?? "Staff updated.");
    });
  };

  const sendAccess = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await sendStaffAccessLink(profileId);
      startCooldown(result.cooldownSeconds ?? 0);
      setMessage(result.error ?? result.message ?? "Access link sent.");
    });
  };

  const revokeInvite = () => {
    if (!invitationId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await revokeStaffInvitation(invitationId);
      if (result.success) setActive(false);
      setMessage(result.error ?? result.message ?? "Invitation revoked.");
    });
  };

  return (
    <div className="flex min-w-[300px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={staffRole}
          onChange={(event) => setStaffRole(event.target.value as StaffOperationalRole)}
          disabled={pending || isCurrentUser}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
        >
          {staffRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {!isCurrentUser && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Save role
          </button>
        )}

        {!isCurrentUser && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(!active)}
            className={
              "rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 " +
              (active
                ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100")
            }
          >
            {active ? "Disable access" : "Enable access"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {active && (
          <button
            type="button"
            disabled={pending || seconds > 0}
            onClick={sendAccess}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {seconds > 0
              ? "Retry in " + seconds + "s"
              : invitationStatus === "invited"
                ? "Resend access link"
                : "Send access link"}
          </button>
        )}

        {invitationStatus === "invited" && invitationId && !isCurrentUser && (
          <button
            type="button"
            disabled={pending}
            onClick={revokeInvite}
            className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-60"
          >
            Revoke invite
          </button>
        )}
      </div>

      {isCurrentUser && (
        <p className="text-[11px] text-slate-400">
          Your own administrator access is protected.
        </p>
      )}
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}

export function PendingInvitationControls({
  invitationId,
}: {
  invitationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await revokeStaffInvitation(invitationId);
            setMessage(result.error ?? result.message ?? "Invitation revoked.");
          });
        }}
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
      >
        {pending ? "Updating…" : "Revoke invitation"}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-slate-500">{message}</p>}
    </div>
  );
}
