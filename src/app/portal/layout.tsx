import Link from "next/link";
import { Notifications } from "@/components/notifications";
import { Brand } from "@/components/brand";
import { notificationEmailConfigStatus } from "@/lib/email";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/auth/access-disabled");
  if (profile.role !== "client") redirect("/dashboard");

  const supabase = await createClient();
  const { data: firm } = await supabase
    .from("firms")
    .select("name,support_email,support_phone,website_url")
    .eq("id", profile.firm_id)
    .maybeSingle();

  const emailConfig = notificationEmailConfigStatus();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="min-w-0">
            <Brand />
            {firm?.name && (
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
                Secure portal for {firm.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/portal"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Home
              </Link>
              <Link
                href="/portal/status"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Status
              </Link>
              <Link
                href="/portal/messages"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Messages
              </Link>
              <Link
                href="/portal/documents"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Documents
              </Link>
              <Link
                href="/portal/returns"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Returns
              </Link>
              <Link
                href="/portal/profile"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Profile
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
            href="/portal/status"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Status
          </Link>
          <Link
            href="/portal/messages"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Messages
          </Link>
          <Link
            href="/portal/documents"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Documents
          </Link>
          <Link
            href="/portal/returns"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Returns
          </Link>
          <Link
            href="/portal/profile"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Profile
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:py-10">{children}</main>
      {firm && (firm.support_email || firm.support_phone || firm.website_url) && (
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6">
            <p>
              Need help? Contact {firm.name}.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {firm.support_email && (
                <a href={`mailto:${firm.support_email}`} className="font-medium text-slate-600 hover:text-blue-600">
                  {firm.support_email}
                </a>
              )}
              {firm.support_phone && (
                <span className="font-medium text-slate-600">{firm.support_phone}</span>
              )}
              {firm.website_url && (
                <a
                  href={firm.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:text-blue-700"
                >
                  Firm website ↗
                </a>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
