"use client";

import { useState, useTransition } from "react";
import { staffRoleOptions, type StaffOperationalRole } from "@/lib/staff-permissions";
import { useEmailCooldown } from "@/lib/use-email-cooldown";
import { inviteStaff } from "./actions";

export function InviteStaffForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [staffRole, setStaffRole] = useState<StaffOperationalRole>("preparer");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { seconds, startCooldown } = useEmailCooldown();

  const fieldClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  const selectedRole = staffRoleOptions.find((option) => option.value === staffRole);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await inviteStaff({ fullName, email, staffRole });
          startCooldown(result.cooldownSeconds ?? 0);
          setMessage(result.error ?? result.message ?? "Invitation sent.");
          if (result.success) {
            setFullName("");
            setEmail("");
            setStaffRole("preparer");
          }
        });
      }}
      className="flex flex-col gap-4"
    >
      <label className="text-sm font-medium text-slate-700">
        Full name
        <input
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Jane Doe"
          required
          className={fieldClass}
        />
      </label>

      <label className="text-sm font-medium text-slate-700">
        Work email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="jane@firm.com"
          required
          className={fieldClass}
        />
      </label>

      <label className="text-sm font-medium text-slate-700">
        Role
        <select
          value={staffRole}
          onChange={(event) => setStaffRole(event.target.value as StaffOperationalRole)}
          className={fieldClass}
        >
          {staffRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
          {selectedRole?.description}
        </span>
      </label>

      <button
        type="submit"
        disabled={pending || seconds > 0}
        className="w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending invite…" : seconds > 0 ? "Retry in " + seconds + "s" : "Invite staff member"}
      </button>

      {message && <p className="text-sm text-slate-500">{message}</p>}
    </form>
  );
}
