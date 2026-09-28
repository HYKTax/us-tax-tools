import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { BatchOrganizerSender } from "./batch-organizer-sender";

export default async function BatchOrganizerPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "organizers.manage")) notFound();

  const supabase = await createClient();
  const [{ data: clients }, { data: templates }] = await Promise.all([
    supabase
      .from("clients")
      .select("id,primary_contact_name,email,client_type")
      .eq("status", "active")
      .order("primary_contact_name")
      .limit(1000),
    supabase
      .from("organizer_templates")
      .select("id,name,tax_year")
      .order("tax_year", { ascending: false })
      .order("name")
      .limit(200),
  ]);

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link
          href="/dashboard/organizers"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Organizers
        </Link>
        <p className="mt-4 text-sm font-semibold text-blue-600">Tax-season setup</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Send organizers in bulk
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Select active clients, choose one reusable template, and send up to 200 organizers in a controlled batch.
        </p>
      </section>

      <BatchOrganizerSender
        clients={clients ?? []}
        templates={templates ?? []}
      />
    </div>
  );
}
