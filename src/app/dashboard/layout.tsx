import { Notifications } from "@/components/notifications";
import { StaffSidebar } from "@/components/staff-sidebar";
import { staffNavigation } from "@/lib/staff-navigation";
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
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-2 px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" aria-label="Firm workspace" className="shrink-0 sm:hidden">
              <Brand compact />
            </Link>
            <div className="hidden sm:block lg:hidden">
              <Brand />
            </div>
            <nav className="hidden items-center gap-1 text-sm lg:flex">
              <Link href="/dashboard" className="font-semibold text-slate-900">Firm workspace</Link>
              <span className="text-slate-300">/</span>
              <span className="text-slate-500">{staffRoleLabel(profile.staff_role)}</span>
            </nav>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                href="/dashboard/search"
                prefetch={false}
                aria-label="Search the firm workspace"
                title="Search the firm workspace"
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
                <span className="hidden md:inline">Search</span>
              </Link>
              <Notifications
                area="dashboard"
                emailConfigured={emailConfig.configured}
                emailMissing={emailConfig.missing}
              />
              <div className="hidden max-w-48 text-right sm:block">
                <p className="truncate text-sm font-medium text-slate-900">{profile.full_name}</p>
                <p className="truncate text-xs text-slate-500">{profile.email}</p>
              </div>
              <form action={signOut}>
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <nav aria-label="Staff navigation" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 text-sm lg:hidden">
            {staffNavigation(canViewActivity, canManageTeam).map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
