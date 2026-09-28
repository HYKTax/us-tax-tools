import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteButton, SendOrganizerForm } from "./client-actions";
import { CreateReturnJobForm } from "@/app/dashboard/work/create-return-job-form";
import { canBePreparer, canBeReviewer, hasStaffPermission, type StaffOperationalRole } from "@/lib/staff-permissions";
import { getCurrentProfile } from "@/lib/auth";
import { StaffDocumentUploader } from "./staff-document-uploader";
import { ClientNotesPanel, type ClientNoteView } from "./client-notes-panel";
import {
  ClientContactForm,
  type ClientContactValues,
} from "@/components/client-contact-form";

type OrganizerRow = {
  id: string;
  title: string;
  tax_year: number;
  status: string;
  sent_at: string | null;
};

type ReturnJobRow = {
  id: string;
  tax_year: number;
  return_type: string;
  status: string;
  due_date: string | null;
};

type ClientAuditRow = {
  id: string;
  action: string;
  target_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor: { full_name: string } | null;
};

function auditLabel(action: string) {
  return action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

function auditCategory(action: string) {
  if (action.startsWith("tax_return.")) return "Tax return";
  if (action.startsWith("document.")) return "Document";
  if (action.startsWith("organizer.")) return "Organizer";
  if (action.startsWith("client_message.")) return "Message";
  if (action.startsWith("client_note.")) return "Internal note";
  if (action.startsWith("client.")) return "Client";
  return "Activity";
}

function auditCategoryClasses(category: string) {
  if (category === "Tax return") return "bg-blue-50 text-blue-700";
  if (category === "Document") return "bg-cyan-50 text-cyan-700";
  if (category === "Organizer") return "bg-amber-50 text-amber-700";
  if (category === "Message") return "bg-violet-50 text-violet-700";
  if (category === "Internal note") return "bg-slate-100 text-slate-700";
  if (category === "Client") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function badge(status: string) {
  if (status === "active" || status === "reviewed" || status === "accepted" || status === "completed") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "submitted" || status === "review" || status === "ready_to_prepare" || status === "ready_to_file") {
    return "bg-blue-50 text-blue-700";
  }
  if (
    status === "sent" ||
    status === "in_progress" ||
    status === "invited" ||
    status === "waiting_on_client" ||
    status === "waiting_on_signature" ||
    status === "extended"
  ) {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const canManageClients = hasStaffPermission(profile, "clients.manage");
  const canManageOrganizers = hasStaffPermission(profile, "organizers.manage");
  const canManageDocuments = hasStaffPermission(profile, "documents.manage");
  const canViewActivity = hasStaffPermission(profile, "audit.view");
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, primary_contact_name, email, client_type, status, phone, address_line1, address_line2, city, state_region, postal_code, country, preferred_contact_method, contact_updated_at")
    .eq("id", id)
    .single();

  if (!client) notFound();

  const [
    { data: organizers },
    { data: templates },
    { data: documents },
    { data: returnJobs },
    { data: staff },
    { data: noteRows },
    { data: allDocumentIds },
  ] = await Promise.all([
    supabase
      .from("organizers")
      .select("id, title, tax_year, status, sent_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("organizer_templates").select("id, name, tax_year").order("name"),
    supabase
      .from("documents")
      .select("id, file_name, status, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("tax_return_jobs")
      .select("id, tax_year, return_type, status, due_date")
      .eq("client_id", id)
      .order("tax_year", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, staff_role")
      .in("role", ["firm_admin", "firm_staff"])
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("client_notes")
      .select("id,author_id,body,is_pinned,created_at,updated_at,author:profiles!client_notes_author_id_fkey(full_name)")
      .eq("client_id", id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("documents")
      .select("id")
      .eq("client_id", id)
      .limit(500),
  ]);

  const organizerRows = (organizers ?? []) as OrganizerRow[];
  const jobRows = (returnJobs ?? []) as ReturnJobRow[];
  const staffRows = (staff ?? []) as Array<{
    id: string;
    full_name: string;
    staff_role: StaffOperationalRole;
  }>;
  const preparers = staffRows.filter((member) => canBePreparer(member.staff_role));
  const reviewers = staffRows.filter((member) => canBeReviewer(member.staff_role));
  const notes: ClientNoteView[] = (noteRows ?? []).map((note) => {
    const author = note.author as unknown as { full_name: string } | null;
    return {
      id: note.id,
      author_id: note.author_id,
      body: note.body,
      is_pinned: note.is_pinned,
      created_at: note.created_at,
      updated_at: note.updated_at,
      author_name: author?.full_name ?? "Staff",
    };
  });
  const canManageOtherNotes =
    profile.role === "firm_admin" ||
    profile.staff_role === "admin" ||
    profile.staff_role === "manager";
  const contact: ClientContactValues = {
    phone: client.phone,
    address_line1: client.address_line1,
    address_line2: client.address_line2,
    city: client.city,
    state_region: client.state_region,
    postal_code: client.postal_code,
    country: client.country,
    preferred_contact_method: client.preferred_contact_method,
    contact_updated_at: client.contact_updated_at,
  };

  const pendingOrganizers = organizerRows.filter((organizer) => ["sent", "in_progress"].includes(organizer.status)).length;
  const submitted = organizerRows.filter((organizer) => organizer.status === "submitted").length;
  const openReturns = jobRows.filter((job) => !["accepted", "completed"].includes(job.status)).length;

  let activityRows: ClientAuditRow[] = [];
  if (canViewActivity) {
    const relatedTargetIds = Array.from(
      new Set([
        client.id,
        ...organizerRows.map((organizer) => organizer.id),
        ...jobRows.map((job) => job.id),
        ...(allDocumentIds ?? []).map((document) => document.id),
      ])
    );

    if (relatedTargetIds.length > 0) {
      const { data: activity } = await supabase
        .from("audit_log")
        .select(
          "id,action,target_type,created_at,metadata,actor:profiles!audit_log_actor_id_fkey(full_name)"
        )
        .in("target_id", relatedTargetIds)
        .order("created_at", { ascending: false })
        .limit(80);

      activityRows = (activity ?? []) as unknown as ClientAuditRow[];
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link href="/dashboard/clients" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← All clients</Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{client.primary_contact_name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge(client.status)}`}>{client.status}</span>
            </div>
            <p className="mt-2 text-slate-500">{client.email} · <span className="capitalize">{client.client_type}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/messages/${client.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Message client
            </Link>
            {canManageClients ? (
              <InviteButton clientId={client.id} status={client.status} />
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Client access: read only
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Tax returns</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{jobRows.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Open return work</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{openReturns}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Waiting on client</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{pendingOrganizers}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Organizers ready for review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{submitted}</p>
        </div>
      </section>

      <ClientContactForm
        clientId={client.id}
        initial={contact}
        editable={canManageClients}
        title="Client contact & mailing details"
        helper={
          canManageClients
            ? "Update the phone, mailing address, and preferred contact method used by the firm."
            : "Contact details are visible to your role but can only be edited by authorized client-management staff."
        }
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-950">Tax returns</h2>
              <p className="mt-1 text-sm text-slate-500">Preparation, review, extension, and filing work for this client.</p>
            </div>
            <Link href="/dashboard/work" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Work queue</Link>
          </div>
          {!jobRows.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No tax returns created yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {jobRows.map((job) => (
                <Link key={job.id} href={`/dashboard/work/${job.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{job.tax_year} {job.return_type}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.due_date ? `Due ${new Date(job.due_date + "T00:00:00").toLocaleDateString()}` : "No due date set"}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge(job.status)}`}>
                    {job.status.replaceAll("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Create tax return</h2>
          <p className="mt-1 text-sm text-slate-500">Add a return to the firm work queue and assign preparation/review responsibility.</p>
          <div className="mt-5">
            <CreateReturnJobForm
              clientId={client.id}
              preparers={preparers}
              reviewers={reviewers}
              organizers={organizerRows.map((organizer) => ({
                id: organizer.id,
                title: organizer.title,
                tax_year: organizer.tax_year,
                status: organizer.status,
              }))}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Organizers</h2>
            <p className="mt-1 text-sm text-slate-500">Questionnaires and document requests sent to this client.</p>
          </div>
          {!organizerRows.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No organizers sent yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {organizerRows.map((organizer) => (
                <Link key={organizer.id} href={`/dashboard/organizers/${organizer.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{organizer.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tax year {organizer.tax_year}{organizer.sent_at ? ` · Sent ${new Date(organizer.sent_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge(organizer.status)}`}>
                    {organizer.status.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Send an organizer</h2>
          <p className="mt-1 text-sm text-slate-500">Choose a reusable template and send it securely to this client.</p>
          <div className="mt-5">
            {canManageOrganizers ? (
              <SendOrganizerForm clientId={client.id} templates={templates ?? []} />
            ) : (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Your role can review existing organizers but cannot send or modify organizer requests.
              </div>
            )}
          </div>
        </div>
      </section>

      {canViewActivity && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Manager view
              </p>
              <h2 className="mt-1 font-semibold text-slate-950">Client activity</h2>
              <p className="mt-1 text-sm text-slate-500">
                Recent audited organizer, document, return, message, note, and client events.
              </p>
            </div>
            <Link
              href="/dashboard/activity"
              className="w-fit text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Firm activity →
            </Link>
          </div>

          {activityRows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No audited activity recorded for this client yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {activityRows.map((row) => {
                const category = auditCategory(row.action);
                return (
                  <div key={row.id} className="px-5 py-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + auditCategoryClasses(category)}>
                            {category}
                          </span>
                          <p className="font-semibold text-slate-900">
                            {auditLabel(row.action)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {row.actor?.full_name ?? "System / unknown actor"}
                          {" · "}
                          <span className="capitalize">{row.target_type.replaceAll("_", " ")}</span>
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <ClientNotesPanel
        clientId={client.id}
        notes={notes}
        currentProfileId={profile.id}
        canManageOthers={canManageOtherNotes}
      />

      {canManageDocuments && (
        <StaffDocumentUploader firmId={profile.firm_id} clientId={client.id} />
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Recent documents</h2>
          <p className="mt-1 text-sm text-slate-500">Latest files received through organizers and the client portal.</p>
        </div>
        {!documents?.length ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((document) => (
              <Link
                key={document.id}
                href={`/dashboard/documents/${document.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{document.file_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(document.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${badge(document.status)}`}>
                    {document.status.replace("_", " ")}
                  </span>
                  <span className="text-sm font-semibold text-blue-600">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
