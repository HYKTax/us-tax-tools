import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReturnJobEditor } from "./return-job-editor";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function ReturnJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: job, error }, { data: staff }] = await Promise.all([
    supabase
      .from("tax_return_jobs")
      .select(
        "id, client_id, organizer_id, tax_year, return_type, status, priority, due_date, preparer_id, reviewer_id, extension_status, extension_filed_at, efile_status, efile_transmitted_at, efile_accepted_at, completed_at, created_at, updated_at, clients(primary_contact_name, email, client_type), organizer:organizers(id,title,status)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["firm_admin", "firm_staff"])
      .order("full_name"),
  ]);

  if (error) throw new Error("Unable to load this tax return.");
  if (!job) notFound();

  const client = job.clients as unknown as {
    primary_contact_name: string;
    email: string;
    client_type: string;
  } | null;
  const organizer = job.organizer as unknown as {
    id: string;
    title: string;
    status: string;
  } | null;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link href="/dashboard/work" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Work / Returns</Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold text-blue-600">Tax return workspace</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
              {job.tax_year} {job.return_type} · {client?.primary_contact_name ?? "Client"}
            </h1>
            <p className="mt-2 text-slate-500">
              <span className="capitalize">{client?.client_type ?? "client"}</span>
              {job.due_date ? ` · Due ${new Date(job.due_date + "T00:00:00").toLocaleDateString()}` : ""}
            </p>
          </div>
          <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold capitalize text-blue-700">
            {statusLabel(job.status)}
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Priority</p>
          <p className="mt-2 text-lg font-semibold capitalize text-slate-950">{job.priority}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Extension</p>
          <p className="mt-2 text-lg font-semibold capitalize text-slate-950">{statusLabel(job.extension_status)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">E-file</p>
          <p className="mt-2 text-lg font-semibold capitalize text-slate-950">{statusLabel(job.efile_status)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Last updated</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{new Date(job.updated_at).toLocaleDateString()}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-950">Workflow</h2>
          <p className="mt-1 text-sm text-slate-500">Update preparation, review, extension, and filing status.</p>
          <div className="mt-5">
            <ReturnJobEditor
              job={{
                id: job.id,
                client_id: job.client_id,
                status: job.status,
                priority: job.priority,
                due_date: job.due_date,
                preparer_id: job.preparer_id,
                reviewer_id: job.reviewer_id,
                extension_status: job.extension_status,
                efile_status: job.efile_status,
              }}
              staff={staff ?? []}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Client</h2>
            <p className="mt-3 text-sm font-semibold text-slate-900">{client?.primary_contact_name ?? "Client"}</p>
            <p className="mt-1 text-sm text-slate-500">{client?.email}</p>
            <Link href={`/dashboard/clients/${job.client_id}`} className="mt-4 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700">
              Open client profile →
            </Link>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Linked organizer</h2>
            {organizer ? (
              <>
                <p className="mt-3 text-sm font-semibold text-slate-900">{organizer.title}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{statusLabel(organizer.status)}</p>
                <Link href={`/dashboard/organizers/${organizer.id}`} className="mt-4 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Open organizer →
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No organizer is linked to this return.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Filing milestones</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Extension filed</dt><dd className="font-medium text-slate-800">{job.extension_filed_at ? new Date(job.extension_filed_at).toLocaleString() : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">E-file transmitted</dt><dd className="font-medium text-slate-800">{job.efile_transmitted_at ? new Date(job.efile_transmitted_at).toLocaleString() : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Accepted</dt><dd className="font-medium text-slate-800">{job.efile_accepted_at ? new Date(job.efile_accepted_at).toLocaleString() : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Completed</dt><dd className="font-medium text-slate-800">{job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"}</dd></div>
            </dl>
          </section>
        </div>
      </section>
    </div>
  );
}
