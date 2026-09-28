import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { FirmSettingsForm } from "./firm-settings-form";

export default async function FirmSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasStaffPermission(profile, "team.manage")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: firm, error } = await supabase
    .from("firms")
    .select("name,support_email,support_phone,website_url,portal_welcome_message")
    .eq("id", profile.firm_id)
    .single();

  if (error || !firm) {
    throw new Error("Unable to load firm settings.");
  }

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Firm administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Firm settings
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Control the firm identity and support details that clients see inside the secure portal.
        </p>
      </section>

      <FirmSettingsForm
        initial={{
          name: firm.name,
          supportEmail: firm.support_email ?? "",
          supportPhone: firm.support_phone ?? "",
          websiteUrl: firm.website_url ?? "",
          portalWelcomeMessage: firm.portal_welcome_message ?? "",
        }}
      />

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-slate-950">Security boundary</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Only Firm Admin access can change these settings. Client accounts can read the firm identity for their own tenant but cannot update it.
        </p>
      </section>
    </div>
  );
}
