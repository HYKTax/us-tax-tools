import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  canBePreparer,
  canBeReviewer,
  hasStaffPermission,
  type StaffOperationalRole,
} from "@/lib/staff-permissions";
import { BatchReturnSetup } from "./batch-return-setup";

export default async function BatchWorkPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.manage")) notFound();

  const supabase = await createClient();
  const [
    { data: clients },
    { data: staff },
    { data: tags },
    { data: tagAssignments },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id,primary_contact_name,email,client_type")
      .eq("status", "active")
      .order("primary_contact_name")
      .limit(1000),
    supabase
      .from("profiles")
      .select("id,full_name,staff_role")
      .in("role", ["firm_admin", "firm_staff"])
      .eq("is_active", true)
      .order("full_name"),
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
  for (const assignment of tagAssignments ?? []) {
    const current = tagIdsByClient.get(assignment.client_id) ?? [];
    current.push(assignment.tag_id);
    tagIdsByClient.set(assignment.client_id, current);
  }

  const enrichedClients = (clients ?? []).map((client) => ({
    ...client,
    tag_ids: tagIdsByClient.get(client.id) ?? [],
  }));

  const staffRows = (staff ?? []) as Array<{
    id: string;
    full_name: string;
    staff_role: StaffOperationalRole;
  }>;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link
          href="/dashboard/work"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Work / Returns
        </Link>
        <p className="mt-4 text-sm font-semibold text-blue-600">Tax-season setup</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Create returns in bulk
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Start a tax year for multiple active clients with shared assignments and due dates.
          Existing client/year/return-type matches are skipped.
        </p>
      </section>

      <BatchReturnSetup
        clients={enrichedClients}
        tags={tags ?? []}
        preparers={staffRows
          .filter((member) => canBePreparer(member.staff_role))
          .map(({ id, full_name }) => ({ id, full_name }))}
        reviewers={staffRows
          .filter((member) => canBeReviewer(member.staff_role))
          .map(({ id, full_name }) => ({ id, full_name }))}
      />
    </div>
  );
}
