import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type ClientRow = {
  id: string;
  primary_contact_name: string;
  email: string;
  status: string;
  profile_id: string | null;
  client_type: string;
};

type ReturnRow = {
  id: string;
  client_id: string;
  tax_year: number;
  return_type: string;
  status: string;
  due_date: string | null;
  preparer_id: string | null;
  reviewer_id: string | null;
  updated_at: string;
  clients: { primary_contact_name: string } | null;
};

type DocumentRow = {
  id: string;
  client_id: string;
  file_name: string;
  status: string;
  created_at: string;
  clients: { primary_contact_name: string } | null;
};

type DocumentRequestRow = {
  id: string;
  client_id: string;
  title: string;
  due_date: string | null;
  status: string;
  created_at: string;
  client: { primary_contact_name: string } | null;
};

type OrganizerRow = {
  id: string;
  client_id: string;
  tax_year: number;
  status: string;
  created_at: string;
};

function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export default async function ReadinessPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "audit.view")) notFound();

  const supabase = await createClient();
  const currentTaxYear = new Date().getFullYear() - 1;
  const staleCutoff = daysAgo(14);
  const documentCutoff = daysAgo(7);

  const [
    { data: clientData, error: clientsError },
    { data: returnData, error: returnsError },
    { data: documentData, error: documentsError },
    { data: organizerData, error: organizersError },
    { data: requestData, error: requestsError },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id,primary_contact_name,email,status,profile_id,client_type")
      .eq("status", "active")
      .order("primary_contact_name")
      .limit(2000),
    supabase
      .from("tax_return_jobs")
      .select(
        "id,client_id,tax_year,return_type,status,due_date,preparer_id,reviewer_id,updated_at,clients(primary_contact_name)"
      )
      .not("status", "in", '("accepted","completed")')
      .order("updated_at", { ascending: true })
      .limit(5000),
    supabase
      .from("documents")
      .select(
        "id,client_id,file_name,status,created_at,clients!documents_client_id_fkey(primary_contact_name)"
      )
      .eq("status", "pending_review")
      .neq("document_kind", "return_copy")
      .order("created_at", { ascending: true })
      .limit(3000),
    supabase
      .from("organizers")
      .select("id,client_id,tax_year,status,created_at")
      .eq("tax_year", currentTaxYear)
      .limit(3000),
    supabase
      .from("document_requests")
      .select("id,client_id,title,due_date,status,created_at,client:clients!document_requests_client_id_fkey(primary_contact_name)")
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(3000),
  ]);

  const clients = (clientData ?? []) as ClientRow[];
  const returns = (returnData ?? []) as unknown as ReturnRow[];
  const documents = (documentData ?? []) as unknown as DocumentRow[];
  const organizers = (organizerData ?? []) as OrganizerRow[];
  const documentRequests = (requestData ?? []) as unknown as DocumentRequestRow[];
  const today = new Date().toISOString().slice(0, 10);
  const overdueDocumentRequests = documentRequests.filter(
    (request) => request.due_date && request.due_date < today
  );

  const noPortalAccess = clients.filter((client) => !client.profile_id);

  const missingPreparer = returns.filter((job) => !job.preparer_id);
  const reviewStageNoReviewer = returns.filter(
    (job) =>
      ["review", "waiting_on_signature", "ready_to_file", "e_filed", "rejected"].includes(job.status) &&
      !job.reviewer_id
  );
  const noDueDate = returns.filter((job) => !job.due_date);
  const staleReturns = returns.filter(
    (job) =>
      job.updated_at < staleCutoff &&
      !["waiting_on_client", "extended"].includes(job.status)
  );
  const oldPendingDocuments = documents.filter(
    (document) => document.created_at < documentCutoff
  );

  const organizerClientIds = new Set(organizers.map((row) => row.client_id));
  const returnClientIds = new Set(
    returns
      .filter((row) => row.tax_year === currentTaxYear)
      .map((row) => row.client_id)
  );
  const clientsWithoutOrganizer = clients.filter(
    (client) =>
      returnClientIds.has(client.id) &&
      !organizerClientIds.has(client.id)
  );

  const totalIssues =
    noPortalAccess.length +
    missingPreparer.length +
    reviewStageNoReviewer.length +
    noDueDate.length +
    staleReturns.length +
    oldPendingDocuments.length +
    clientsWithoutOrganizer.length +
    overdueDocumentRequests.length;

  const dataError =
    clientsError || returnsError || documentsError || organizersError || requestsError;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Quality control</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Tax season readiness
          </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Exceptions that can slow preparation, review, filing, or client communication.
            This page is generated from live firm data.
          </p>
        </div>
        <Link
          href="/dashboard/analytics"
          className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View analytics
        </Link>
      </section>

      {dataError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Some readiness checks could not be completed. Results may be incomplete.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={
          "rounded-2xl border p-5 shadow-sm " +
          (totalIssues === 0
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50")
        }>
          <p className={totalIssues === 0 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-amber-700"}>
            Open exceptions
          </p>
          <p className={totalIssues === 0 ? "mt-2 text-3xl font-semibold text-emerald-950" : "mt-2 text-3xl font-semibold text-amber-950"}>
            {totalIssues}
          </p>
          <p className={totalIssues === 0 ? "mt-1 text-xs text-emerald-700" : "mt-1 text-xs text-amber-700"}>
            {totalIssues === 0 ? "No readiness exceptions found" : "Across all automated checks"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active clients</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{clients.length}</p>
          <p className="mt-1 text-xs text-slate-500">{currentTaxYear} tax-season readiness population</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Open returns</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{returns.length}</p>
          <p className="mt-1 text-xs text-slate-500">Returns not yet accepted/completed</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending source documents</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{documents.length}</p>
          <p className="mt-1 text-xs text-slate-500">Files awaiting staff review</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <IssueCard
          title="Clients without portal access"
          count={noPortalAccess.length}
          helper="Active clients not yet linked to a portal profile"
          href="/dashboard/clients"
          severity={noPortalAccess.length ? "amber" : "clear"}
        />
        <IssueCard
          title="Returns without preparer"
          count={missingPreparer.length}
          helper="Open returns with no preparation owner"
          href="/dashboard/work?owner=unassigned"
          severity={missingPreparer.length ? "red" : "clear"}
        />
        <IssueCard
          title="Review-stage returns without reviewer"
          count={reviewStageNoReviewer.length}
          helper="Later-stage work missing reviewer assignment"
          href="/dashboard/work"
          severity={reviewStageNoReviewer.length ? "red" : "clear"}
        />
        <IssueCard
          title="Returns without due date"
          count={noDueDate.length}
          helper="Open returns missing a target deadline"
          href="/dashboard/work"
          severity={noDueDate.length ? "amber" : "clear"}
        />
        <IssueCard
          title="Stale returns"
          count={staleReturns.length}
          helper="No update in 14+ days, excluding waiting/extended"
          href="/dashboard/work"
          severity={staleReturns.length ? "amber" : "clear"}
        />
        <IssueCard
          title="Old documents pending review"
          count={oldPendingDocuments.length}
          helper="Source documents waiting more than 7 days"
          href="/dashboard/documents"
          severity={oldPendingDocuments.length ? "amber" : "clear"}
        />
        <IssueCard
          title="Overdue document requests"
          count={overdueDocumentRequests.length}
          helper="Requested client documents past their due date"
          href="/dashboard/requests"
          severity={overdueDocumentRequests.length ? "red" : "clear"}
        />
        <IssueCard
          title={`${currentTaxYear} returns without organizer`}
          count={clientsWithoutOrganizer.length}
          helper="Clients with a current-year return but no matching-year organizer"
          href="/dashboard/organizers/batch"
          severity={clientsWithoutOrganizer.length ? "amber" : "clear"}
        />
      </section>

      {totalIssues > 0 && (
        <section className="grid gap-6 xl:grid-cols-2">
          {missingPreparer.length > 0 && (
            <ExceptionList
              title="Unassigned preparation"
              rows={missingPreparer.slice(0, 12).map((job) => ({
                key: job.id,
                title: job.clients?.primary_contact_name ?? "Client",
                detail: `${job.tax_year} ${job.return_type} · ${job.status.replaceAll("_", " ")}`,
                href: `/dashboard/work/${job.id}` as Route,
              }))}
              more={Math.max(0, missingPreparer.length - 12)}
            />
          )}

          {staleReturns.length > 0 && (
            <ExceptionList
              title="Stale open returns"
              rows={staleReturns.slice(0, 12).map((job) => ({
                key: job.id,
                title: job.clients?.primary_contact_name ?? "Client",
                detail: `${job.tax_year} ${job.return_type} · last updated ${new Date(job.updated_at).toLocaleDateString()}`,
                href: `/dashboard/work/${job.id}` as Route,
              }))}
              more={Math.max(0, staleReturns.length - 12)}
            />
          )}

          {oldPendingDocuments.length > 0 && (
            <ExceptionList
              title="Aged document review"
              rows={oldPendingDocuments.slice(0, 12).map((document) => ({
                key: document.id,
                title: document.clients?.primary_contact_name ?? "Client",
                detail: `${document.file_name} · received ${new Date(document.created_at).toLocaleDateString()}`,
                href: `/dashboard/documents/${document.id}` as Route,
              }))}
              more={Math.max(0, oldPendingDocuments.length - 12)}
            />
          )}

          {noPortalAccess.length > 0 && (
            <ExceptionList
              title="Portal access gaps"
              rows={noPortalAccess.slice(0, 12).map((client) => ({
                key: client.id,
                title: client.primary_contact_name,
                detail: `${client.email} · ${client.client_type}`,
                href: `/dashboard/clients/${client.id}` as Route,
              }))}
              more={Math.max(0, noPortalAccess.length - 12)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function IssueCard({
  title,
  count,
  helper,
  href,
  severity,
}: {
  title: string;
  count: number;
  helper: string;
  href: Route;
  severity: "red" | "amber" | "clear";
}) {
  const classes =
    severity === "red"
      ? "border-red-200 bg-red-50"
      : severity === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-emerald-200 bg-emerald-50";

  const textClasses =
    severity === "red"
      ? "text-red-950"
      : severity === "amber"
        ? "text-amber-950"
        : "text-emerald-950";

  return (
    <Link
      href={href}
      className={`rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${classes}`}
    >
      <p className={`text-sm font-semibold ${textClasses}`}>{title}</p>
      <p className={`mt-2 text-3xl font-semibold ${textClasses}`}>{count}</p>
      <p className="mt-1 text-xs text-slate-600">{helper}</p>
    </Link>
  );
}

function ExceptionList({
  title,
  rows,
  more,
}: {
  title: string;
  rows: Array<{ key: string; title: string; detail: string; href: Route }>;
  more: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <Link
            key={row.key}
            href={row.href}
            className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{row.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{row.detail}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-blue-600">Open →</span>
          </Link>
        ))}
      </div>
      {more > 0 && (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          + {more} more exception{more === 1 ? "" : "s"}
        </p>
      )}
    </section>
  );
}
