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
import { BulkReturnManager, type BulkJobOption } from "./bulk-return-manager";

export default async function BulkManageReturnsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "returns.manage")) notFound();

  const supabase = await createClient();
  const [{ data: jobs }, { data: staff }] = await Promise.all([
    supabase
      .from("tax_return_jobs")
      .select(
        "id,tax_year,return_type,status,priority,due_date,clients(primary_contact_name),preparer:profiles!tax_return_jobs_preparer_id_fkey(full_name),reviewer:profiles!tax_return_jobs_reviewer_id_fkey(full_name)"
      )
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("profiles")
      .select("id,full_name,staff_role")
      .in("role", ["firm_admin", "firm_staff"])
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const jobRows: BulkJobOption[] = (jobs ?? []).map((job) => {
    const client = job.clients as unknown as { primary_contact_name: string } | null;
    const preparer = job.preparer as unknown as { full_name: string } | null;
    const reviewer = job.reviewer as unknown as { full_name: string } | null;

    return {
      id: job.id,
      tax_year: job.tax_year,
      return_type: job.return_type,
      status: job.status,
      priority: job.priority,
      due_date: job.due_date,
      client_name: client?.primary_contact_name ?? "Client",
      preparer_name: preparer?.full_name ?? null,
      reviewer_name: reviewer?.full_name ?? null,
    };
  });

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
        <p className="mt-4 text-sm font-semibold text-blue-600">Firm workload</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Bulk manage returns
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Assign preparers and reviewers, set priority, or change due dates across multiple return jobs while preserving the normal review controls.
        </p>
      </section>

      <BulkReturnManager
        jobs={jobRows}
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
