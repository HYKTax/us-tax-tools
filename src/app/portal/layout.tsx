import Link from "next/link";
import { Notifications } from "@/components/notifications";
import { Brand } from "@/components/brand";
import { notificationEmailConfigStatus } from "@/lib/email";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentProfile } from "@/lib/auth";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/auth/access-disabled");
  if (profile.role !== "client") redirect("/dashboard");
  const emailConfig = notificationEmailConfigStatus();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/portal"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Home
              </Link>
              <Link
                href="/portal/returns"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Returns
              </Link>
            </nav>
            <Notifications area="portal" emailConfigured={emailConfig.configured} />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{profile.full_name}</p>
              <p className="text-xs text-slate-500">Client portal</p>
            </div>
            <form action={signOut}>
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 border-t border-slate-100 px-4 py-2 sm:hidden">
          <Link
            href="/portal"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Home
          </Link>
          <Link
            href="/portal/returns"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Returns
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
