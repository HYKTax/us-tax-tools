import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ReturnJobEditor } from "./return-job-editor";
import { ReturnReviewPanel } from "./return-review-panel";
import {
  canBePreparer,
  canBeReviewer,
  hasStaffPermission,
  type StaffOperationalRole,
} from "@/lib/staff-permissions";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

type ReturnReviewRow = {
  id: string;
  cycle_number: number;
  return_version: number;
  status: "requested" | "changes_requested" | "approved";
  request_note: string | null;
  resolution_note: string | null;
  requested_at: string;
  resolved_at: string | null;
  requester: { full_name: string } | null;
  reviewer: { full_name: string } | null;
  resolver: { full_name: string } | null;
};

type ApprovedSourceValue = {
  id: string;
  document_id: string;
  field_name: string;
  field_label: string;
  value: string;
  confidence: number | null;
  accepted_at: string;
  documents: { file_name: string } | null;
};

function extractionClasses(status: string) {
  if (status === "completed") return "bg-blue-50 text-blue-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "unsupported") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

export default async function ReturnJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const canManageReturns = hasStaffPermission(profile, "returns.manage");
  const canReviewReturns = hasStaffPermission(profile, "returns.review");
  const supabase = await createClient();

  const [{ data: job, error }, { data: staff }] = await Promise.all([
    supabase
      .from("tax_return_jobs")
      .select(
        "id, client_id, organizer_id, tax_year, return_type, status, priority, due_date, preparer_id, reviewer_id, review_version, extension_status, extension_filed_at, efile_status, efile_transmitted_at, efile_accepted_at, completed_at, created_at, updated_at, clients(primary_contact_name, email, client_type), organizer:organizers(id,title,status)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, staff_role")
      .in("role", ["firm_admin", "firm_staff"])
      .eq("is_active", true)
      .order("full_name"),
  ]);

  if (error) throw new Error("Unable to load this tax return.");
  if (!job) notFound();

  const staffRows = (staff ?? []) as Array<{
    id: string;
    full_name: string;
    staff_role: StaffOperationalRole;
  }>;
  const preparers = staffRows.filter((member) => canBePreparer(member.staff_role));
  const reviewers = staffRows.filter((member) => canBeReviewer(member.staff_role));

  const [{ data: documents }, { data: sourceValues }, { data: reviewRows }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, file_name, status, created_at, document_extractions(status,document_type,tax_year,reviewed_at,confidence,summary)"
      )
      .eq("tax_return_job_id", job.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tax_return_source_values")
      .select("id, document_id, field_name, field_label, value, confidence, accepted_at, documents(file_name)")
      .eq("tax_return_job_id", job.id)
      .order("field_name")
      .order("accepted_at", { ascending: false }),
    supabase
      .from("tax_return_reviews")
      .select(
        "id, cycle_number, return_version, status, request_note, resolution_note, requested_at, resolved_at, requester:profiles!tax_return_reviews_requested_by_fkey(full_name), reviewer:profiles!tax_return_reviews_assigned_reviewer_id_fkey(full_name), resolver:profiles!tax_return_reviews_resolved_by_fkey(full_name)"
      )
      .eq("tax_return_job_id", job.id)
      .order("cycle_number", { ascending: false }),
  ]);

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

  const linkedDocuments = documents ?? [];
  const reviewedDocuments = linkedDocuments.filter((document) => document.status === "reviewed").length;
  const completedExtractions = linkedDocuments.filter((document) => {
    const raw = document.document_extractions as unknown;
    const extraction = Array.isArray(raw) ? raw[0] : raw;
    return Boolean(extraction && typeof extraction === "object" && "status" in extraction && extraction.status === "completed");
  }).length;
  const sourceDocumentsReady = linkedDocuments.every(
    (document) => document.status === "reviewed"
  );
  const aiReviewsReady = linkedDocuments.every((document) => {
    const raw = document.document_extractions as unknown;
    const extraction = (Array.isArray(raw) ? raw[0] : raw) as
      | { status?: string; reviewed_at?: string | null }
      | null
      | undefined;
    return extraction?.status !== "completed" || Boolean(extraction.reviewed_at);
  });

  const approvedSourceValues = (sourceValues ?? []) as unknown as ApprovedSourceValue[];
  const fieldValueSets = new Map<string, Set<string>>();
  for (const field of approvedSourceValues) {
    const values = fieldValueSets.get(field.field_name) ?? new Set<string>();
    values.add(field.value);
    fieldValueSets.set(field.field_name, values);
  }
  const conflictingFields = new Set(
    [...fieldValueSets.entries()].filter(([, values]) => values.size > 1).map(([name]) => name)
  );

  const reviews = ((reviewRows ?? []) as unknown as ReturnReviewRow[]).map((review) => ({
    id: review.id,
    cycle_number: review.cycle_number,
    return_version: review.return_version,
    status: review.status,
    request_note: review.request_note,
    resolution_note: review.resolution_note,
    requested_at: review.requested_at,
    resolved_at: review.resolved_at,
    requester_name: review.requester?.full_name ?? "Staff",
    reviewer_name: review.reviewer?.full_name ?? "Reviewer",
    resolver_name: review.resolver?.full_name ?? null,
  }));
  const openReview = reviews.find((review) => review.status === "requested") ?? null;
  const hasCurrentApproval = reviews.some(
    (review) =>
      review.status === "approved" &&
      review.return_version === job.review_version
  );

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
          <p className="text-sm text-slate-500">Documents reviewed</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{reviewedDocuments}/{linkedDocuments.length}</p>
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
              preparers={preparers}
              reviewers={reviewers}
              hasCurrentApproval={hasCurrentApproval}
              reviewLocked={Boolean(openReview)}
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

      <ReturnReviewPanel
        jobId={job.id}
        clientId={job.client_id}
        jobStatus={job.status}
        preparerAssigned={Boolean(job.preparer_id)}
        reviewerAssigned={Boolean(job.reviewer_id)}
        reviews={reviews}
        canManageReturns={canManageReturns}
        canReviewReturns={canReviewReturns}
        sourceDocumentsReady={sourceDocumentsReady}
        aiReviewsReady={aiReviewsReady}
        hasSourceConflicts={conflictingFields.size > 0}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Approved return data</h2>
            <p className="mt-1 text-sm text-slate-500">
              Human-reviewed source values available for future tax-software export.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
              {approvedSourceValues.length} approved fields
            </span>
            {conflictingFields.size > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                {conflictingFields.size} conflict{conflictingFields.size === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        {approvedSourceValues.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">No approved source data yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Review an AI extraction and its original document, then accept the fields into return data.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Field</th>
                  <th className="px-5 py-3">Value</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Confidence</th>
                  <th className="px-5 py-3">Accepted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {approvedSourceValues.map((field) => (
                  <tr key={field.id} className={conflictingFields.has(field.field_name) ? "bg-red-50/40" : ""}>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{field.field_label}</span>
                        {conflictingFields.has(field.field_name) && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            Check conflict
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{field.field_name}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-800">{field.value}</td>
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/documents/${field.document_id}`} className="font-medium text-blue-600 hover:text-blue-700">
                        {field.documents?.file_name ?? "Source document"}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {field.confidence === null ? "—" : `${Math.round(field.confidence * 100)}%`}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{new Date(field.accepted_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Source documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              {linkedDocuments.length} linked · {completedExtractions} AI extracted · {reviewedDocuments} document reviewed
            </p>
          </div>
          <Link href="/dashboard/documents" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            Open document center
          </Link>
        </div>

        {linkedDocuments.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">No documents linked yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Open a client document and link it to this return to keep source data with the preparation workflow.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {linkedDocuments.map((document) => {
              const raw = document.document_extractions as unknown;
              const extraction = (Array.isArray(raw) ? raw[0] : raw) as
                | {
                    status: string;
                    document_type: string | null;
                    tax_year: number | null;
                    reviewed_at: string | null;
                    confidence: number | null;
                    summary: string | null;
                  }
                | null
                | undefined;

              return (
                <Link
                  key={document.id}
                  href={`/dashboard/documents/${document.id}`}
                  className="flex flex-col justify-between gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{document.file_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {extraction?.document_type || "Document"}
                      {extraction?.tax_year ? ` · ${extraction.tax_year}` : ""}
                      {extraction?.summary ? ` · ${extraction.summary}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${document.status === "reviewed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {document.status.replaceAll("_", " ")}
                    </span>
                    {extraction ? (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${extractionClasses(extraction.status)}`}>
                        AI {extraction.status}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">No AI data</span>
                    )}
                    {extraction?.reviewed_at && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">AI reviewed</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
