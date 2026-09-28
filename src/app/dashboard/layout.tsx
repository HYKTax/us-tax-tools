import { Notifications } from "@/components/notifications";
import { StaffSidebar } from "@/components/staff-sidebar";
import { Brand } from "@/components/brand";
import { notificationEmailConfigStatus } from "@/lib/email";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission, staffRoleLabel } from "@/lib/staff-permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/auth/access-disabled");
  if (profile.role === "client") redirect("/portal");

  const canViewActivity = hasStaffPermission(profile, "audit.view");
  const canManageTeam = hasStaffPermission(profile, "team.manage");
  const emailConfig = notificationEmailConfigStatus();

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <StaffSidebar canViewActivity={canViewActivity} canManageTeam={canManageTeam} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand />
            </div>
            <nav className="hidden items-center gap-1 text-sm lg:flex">
              <Link href="/dashboard" className="font-semibold text-slate-900">Firm workspace</Link>
              <span className="text-slate-300">/</span>
              <span className="text-slate-500">{staffRoleLabel(profile.staff_role)}</span>
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <Notifications
                area="dashboard"
                emailConfigured={emailConfig.configured}
                emailMissing={emailConfig.missing}
              />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-slate-900">{profile.full_name}</p>
                <p className="text-xs text-slate-500">{profile.email}</p>
              </div>
              <form action={signOut}>
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 text-sm lg:hidden">
            <Link href="/dashboard" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Dashboard</Link>
            <Link href="/dashboard/work" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Work</Link>
            <Link href="/dashboard/deadlines" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Deadlines</Link>
            <Link href="/dashboard/tasks" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Tasks</Link>
            <Link href="/dashboard/clients" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Clients</Link>
            <Link href="/dashboard/organizers" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Organizers</Link>
            <Link href="/dashboard/documents" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Documents</Link>
            <Link href="/dashboard/messages" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Messages</Link>
            <Link href="/dashboard/templates" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Templates</Link>
            {canViewActivity && (
              <Link href="/dashboard/activity" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Activity</Link>
            )}
            {canManageTeam && (
              <Link href="/dashboard/team" className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">Team</Link>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
