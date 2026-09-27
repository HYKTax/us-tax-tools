import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { Brand } from "@/components/brand";
import { getCurrentProfile } from "@/lib/auth";

export default async function AccessDisabledPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.is_active) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Brand />
        <p className="mt-8 text-sm font-semibold text-amber-600">Access disabled</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Your firm access is currently disabled.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Contact a firm administrator if you believe you should still have access to the Tax Preparer Tools workspace.
        </p>
        <form action={signOut} className="mt-6">
          <button className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
