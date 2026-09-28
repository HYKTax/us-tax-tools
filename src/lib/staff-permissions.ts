export type StaffOperationalRole = "admin" | "manager" | "reviewer" | "preparer";

export type StaffPermission =
  | "clients.manage"
  | "organizers.manage"
  | "organizers.review"
  | "documents.manage"
  | "ai.run"
  | "documents.review"
  | "returns.manage"
  | "returns.review"
  | "templates.manage"
  | "tasks.manage"
  | "team.manage"
  | "audit.view";

export const staffRoleOptions: Array<{
  value: StaffOperationalRole;
  label: string;
  description: string;
}> = [
  {
    value: "admin",
    label: "Firm Admin",
    description: "Full firm access, including Team and permissions.",
  },
  {
    value: "manager",
    label: "Manager",
    description: "Manage clients, organizers, documents, returns, reviews, and templates.",
  },
  {
    value: "reviewer",
    label: "Reviewer",
    description: "Review organizers, documents, AI data, and tax-return workflow.",
  },
  {
    value: "preparer",
    label: "Preparer",
    description: "Prepare clients, organizers, documents, AI extraction, and returns.",
  },
];

const rolePermissions: Record<StaffOperationalRole, ReadonlySet<StaffPermission>> = {
  admin: new Set<StaffPermission>([
    "clients.manage",
    "organizers.manage",
    "organizers.review",
    "documents.manage",
    "ai.run",
    "documents.review",
    "returns.manage",
    "returns.review",
    "templates.manage",
    "tasks.manage",
    "team.manage",
    "audit.view",
  ]),
  manager: new Set<StaffPermission>([
    "clients.manage",
    "organizers.manage",
    "organizers.review",
    "documents.manage",
    "ai.run",
    "documents.review",
    "returns.manage",
    "returns.review",
    "templates.manage",
    "tasks.manage",
    "audit.view",
  ]),
  reviewer: new Set<StaffPermission>([
    "organizers.review",
    "ai.run",
    "documents.review",
    "returns.manage",
    "returns.review",
    "tasks.manage",
  ]),
  preparer: new Set<StaffPermission>([
    "clients.manage",
    "organizers.manage",
    "documents.manage",
    "ai.run",
    "returns.manage",
    "tasks.manage",
  ]),
};

export function normalizeStaffRole(input: string | null | undefined): StaffOperationalRole | null {
  if (input === "admin" || input === "manager" || input === "reviewer" || input === "preparer") {
    return input;
  }
  return null;
}

export function staffRoleLabel(role: StaffOperationalRole | null | undefined) {
  return staffRoleOptions.find((option) => option.value === role)?.label ?? "Staff";
}

export function hasStaffPermission(
  profile: {
    role: "firm_admin" | "firm_staff" | "client";
    staff_role?: StaffOperationalRole | null;
    is_active: boolean;
  },
  permission: StaffPermission
) {
  if (!profile.is_active || profile.role === "client") return false;
  if (profile.role === "firm_admin") return true;
  const role = normalizeStaffRole(profile.staff_role) ?? "preparer";
  return rolePermissions[role].has(permission);
}

export function canBePreparer(role: StaffOperationalRole | null | undefined) {
  return role === "admin" || role === "manager" || role === "preparer";
}

export function canBeReviewer(role: StaffOperationalRole | null | undefined) {
  return role === "admin" || role === "manager" || role === "reviewer";
}
