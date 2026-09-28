import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { EngagementManager } from "./engagement-manager";

export default async function EngagementsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client" || !profile.is_active) notFound();

  const supabase = await createClient();

  const [
    { data: templates },
    { data: clients },
    { data: engagements },
  ] = await Promise.all([
    supabase
      .from("engagement_templates")
      .select("id,name,title,body,is_active,created_at")
      .order("is_active", { ascending: false })
      .order("name"),
    supabase
      .from("clients")
      .select("id,primary_contact_name,email,status")
      .eq("status", "active")
      .order("primary_contact_name")
      .limit(1000),
    supabase
      .from("client_engagements")
      .select("id,client_id,title,status,sent_at,acknowledged_name,acknowledged_at,client:clients(primary_contact_name)")
      .order("sent_at", { ascending: false })
      .limit(500),
  ]);

  const canManageTemplates = hasStaffPermission(profile, "templates.manage");
  const canManageClients = hasStaffPermission(profile, "clients.manage");

  if (!canManageTemplates && !canManageClients) notFound();

  const engagementRows = (engagements ?? []).map((row) => {
    const client = row.client as unknown as { primary_contact_name: string } | null;
    return {
      id: row.id,
      client_id: row.client_id,
      title: row.title,
      status: row.status,
      sent_at: row.sent_at,
      acknowledged_name: row.acknowledged_name,
      acknowledged_at: row.acknowledged_at,
      client_name: client?.primary_contact_name ?? "Client",
    };
  });

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Client onboarding</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Engagements
          </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Reusable engagement text, secure client delivery, and portal acknowledgment tracking.
          </p>
        </div>
        {canManageClients && (
          <Link
            href="/dashboard/engagements/batch"
            className="w-fit rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            Batch send
          </Link>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Templates</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{templates?.length ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Awaiting acknowledgment</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">
            {engagementRows.filter((item) => item.status === "sent").length}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Acknowledged</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">
            {engagementRows.filter((item) => item.status === "acknowledged").length}
          </p>
        </div>
      </section>

      <EngagementManager
        templates={templates ?? []}
        clients={clients ?? []}
        engagements={engagementRows}
      />
    </div>
  );
}
