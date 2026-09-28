const baseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/dashboard/work", label: "Work / Returns", icon: "work" },
  { href: "/dashboard/deadlines", label: "Deadlines", icon: "calendar" },
  { href: "/dashboard/tasks", label: "Tasks", icon: "tasks" },
  { href: "/dashboard/clients", label: "Clients", icon: "users" },
  { href: "/dashboard/organizers", label: "Organizers", icon: "clipboard" },
  { href: "/dashboard/documents", label: "Documents", icon: "folder" },
  { href: "/dashboard/requests", label: "Document requests", icon: "request" },
  { href: "/dashboard/messages", label: "Messages", icon: "message" },
  { href: "/dashboard/templates", label: "Templates", icon: "clipboard" },
  { href: "/dashboard/engagements", label: "Engagements", icon: "clipboard" },
] as const;

const readinessNavItem = { href: "/dashboard/readiness", label: "Readiness", icon: "readiness" } as const;
const analyticsNavItem = { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" } as const;
const workloadNavItem = { href: "/dashboard/workload", label: "Team workload", icon: "workload" } as const;
const activityNavItem = { href: "/dashboard/activity", label: "Activity", icon: "activity" } as const;
const usageNavItem = { href: "/dashboard/usage", label: "Usage", icon: "analytics" } as const;
const adminNavItem = { href: "/dashboard/team", label: "Team", icon: "users" } as const;
const settingsNavItem = { href: "/dashboard/settings", label: "Settings", icon: "settings" } as const;


export function staffNavigation(canViewActivity: boolean, canManageTeam: boolean) {
  return [
    ...baseNavItems,
    ...(canViewActivity ? [readinessNavItem, analyticsNavItem, workloadNavItem, activityNavItem, usageNavItem] : []),
    ...(canManageTeam ? [adminNavItem, settingsNavItem] : []),
  ];
}
