import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { BatchEngagementSender } from "./batch-engagement-sender";

export default async function BatchEngagementPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) notFound();

  const supabase = await createClient();
  const [
    { data: clients },
    { data: templates },
    { data: tags },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id,primary_contact_name,email,client_type")
      .eq("status", "active")
      .order("primary_contact_name")
      .limit(1000),
    supabase
      .from("engagement_templates")
      .select("id,name,title")
      .eq("is_active", true)
      .order("name")
      .limit(200),
    supabase
      .from("client_tags")
      .select("id,name")
      .order("name")
      .limit(200),
    supabase
      .from("client_tag_assignments")
      .select("client_id,tag_id")
      .limit(5000),
  ]);

  const tagIdsByClient = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const current = tagIdsByClient.get(assignment.client_id) ?? [];
    current.push(assignment.tag_id);
    tagIdsByClient.set(assignment.client_id, current);
  }

  const enrichedClients = (clients ?? []).map((client) => ({
    ...client,
    tag_ids: tagIdsByClient.get(client.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link
          href="/dashboard/engagements"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Engagements
        </Link>
        <p className="mt-4 text-sm font-semibold text-blue-600">Client onboarding</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Send engagements in bulk
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Select active clients, filter by tags, and deliver one engagement template to as many as 200 clients in a controlled batch.
        </p>
      </section>

      <BatchEngagementSender
        clients={enrichedClients}
        templates={templates ?? []}
        tags={tags ?? []}
      />
    </div>
  );
}
