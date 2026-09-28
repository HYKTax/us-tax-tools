import Link from "next/link";
import { Brand } from "@/components/brand";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/dashboard/work", label: "Work / Returns", icon: "work" },
  { href: "/dashboard/deadlines", label: "Deadlines", icon: "calendar" },
  { href: "/dashboard/tasks", label: "Tasks", icon: "tasks" },
  { href: "/dashboard/clients", label: "Clients", icon: "users" },
  { href: "/dashboard/organizers", label: "Organizers", icon: "clipboard" },
  { href: "/dashboard/documents", label: "Documents", icon: "folder" },
  { href: "/dashboard/messages", label: "Messages", icon: "message" },
  { href: "/dashboard/templates", label: "Templates", icon: "clipboard" },
] as const;

const analyticsNavItem = { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" } as const;
const workloadNavItem = { href: "/dashboard/workload", label: "Team workload", icon: "workload" } as const;
const activityNavItem = { href: "/dashboard/activity", label: "Activity", icon: "activity" } as const;
const adminNavItem = { href: "/dashboard/team", label: "Team", icon: "users" } as const;
const settingsNavItem = { href: "/dashboard/settings", label: "Settings", icon: "settings" } as const;

function Icon({ name }: { name: string }) {
  const common = "h-4 w-4";

  if (name === "users") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  }

  if (name === "clipboard") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 9h6M9 13h6M9 17h4"/></svg>;
  }

  if (name === "folder") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>;
  }

  if (name === "message") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg>;
  }

  if (name === "work") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>;
  }

  if (name === "tasks") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 9 1.5 1.5L12 8M14 9h3M8 15l1.5 1.5L12 14M14 15h3"/></svg>;
  }

  if (name === "calendar") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><path d="M8 14h2M14 14h2M8 18h2"/></svg>;
  }

  if (name === "analytics") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 7 5-3 5 4 5-5"/></svg>;
  }

  if (name === "workload") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M4 19V11M10 19V5M16 19v-9M22 19V8"/><path d="M2 19h20"/></svg>;
  }

  if (name === "settings") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.33.72.6 1 .3.28.68.43 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z"/></svg>;
  }

  if (name === "activity") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/><path d="M2 19h20"/></svg>;
  }

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}

export function StaffSidebar({
  canViewActivity,
  canManageTeam,
}: {
  canViewActivity: boolean;
  canManageTeam: boolean;
}) {
  const navItems = [
    ...baseNavItems,
    ...(canViewActivity ? [analyticsNavItem, workloadNavItem, activityNavItem] : []),
    ...(canManageTeam ? [adminNavItem, settingsNavItem] : []),
  ];

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 lg:flex lg:min-h-screen lg:flex-col">
      <div className="border-b border-white/10 px-5 py-5">
        <Brand inverse />
        <p className="mt-2 text-xs text-slate-400">Firm workspace</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
        <div className="mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Coming next
        </div>
        <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
          <span className="px-3 py-2">Return delivery / e-signature</span>
          <span className="px-3 py-2">E-file status integration</span>
        </div>
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-500">
        Secure workspace for tax professionals
      </div>
    </aside>
  );
}
