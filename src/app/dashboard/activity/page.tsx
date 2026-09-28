import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission, staffRoleLabel, type StaffOperationalRole } from "@/lib/staff-permissions";

type AuditActor = {
  full_name: string;
  email: string;
  staff_role: StaffOperationalRole | null;
} | null;

type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: AuditActor;
};

function actionLabel(action: string) {
  return action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

function targetLabel(targetType: string) {
  return targetType.replaceAll("_", " ");
}

function targetHref(row: AuditRow): Route | null {
  if (row.target_type === "client") return ("/dashboard/clients/" + row.target_id) as Route;
  if (row.target_type === "document") return ("/dashboard/documents/" + row.target_id) as Route;
  if (row.target_type === "organizer") return ("/dashboard/organizers/" + row.target_id) as Route;
  if (row.target_type === "tax_return_job") return ("/dashboard/work/" + row.target_id) as Route;
  if (row.target_type === "profile" || row.target_type === "staff_invitation") return "/dashboard/team";
  if (row.target_type === "template") return "/dashboard/templates";
  return null;
}

function category(action: string) {
  if (action.startsWith("staff.") || action.startsWith("account.")) return "Team & access";
  if (action.startsWith("document.")) return "Documents";
  if (action.startsWith("organizer.")) return "Organizers";
  if (action.startsWith("tax_return.")) return "Tax returns";
  if (action.startsWith("template.")) return "Templates";
  if (action.startsWith("client.")) return "Clients";
  return "Other";
}

function categoryClasses(value: string) {
  if (value === "Team & access") return "bg-violet-50 text-violet-700";
  if (value === "Documents") return "bg-cyan-50 text-cyan-700";
  if (value === "Organizers") return "bg-amber-50 text-amber-700";
  if (value === "Tax returns") return "bg-blue-50 text-blue-700";
  if (value === "Templates") return "bg-slate-100 text-slate-700";
  if (value === "Clients") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function formatUtc(value: string) {
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function metadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;

  const allowedKeys = [
    "email",
    "role",
    "staff_role",
    "return_type",
    "tax_year",
    "status",
    "old_status",
    "new_status",
    "document_type",
    "field_count",
    "software",
    "format",
    "mapped_count",
    "unmapped_count",
    "review_version",
  ];

  const parts = allowedKeys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
    .map((key) => {
      const label = key.replaceAll("_", " ");
      const value = String(metadata[key]);
      return label + ": " + value;
    });

  return parts.length ? parts.join(" · ") : null;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await searchParams;
  const query = firstParam(filters.q).trim().toLowerCase();
  const categoryFilter = firstParam(filters.category);
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!hasStaffPermission(profile, "audit.view")) redirect("/dashboard");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, actor_id, action, target_type, target_id, metadata, created_at, actor:profiles!audit_log_actor_id_fkey(full_name,email,staff_role)"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const allRows = (data ?? []) as unknown as AuditRow[];
  const rows = allRows.filter((row) => {
    const eventCategory = category(row.action);
    if (categoryFilter && eventCategory !== categoryFilter) return false;

    if (query) {
      const searchable = [
        row.action,
        row.target_type,
        row.actor?.full_name ?? "",
        row.actor?.email ?? "",
        metadataSummary(row.metadata) ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(query)) return false;
    }

    return true;
  });

  const actorCount = new Set(allRows.map((row) => row.actor_id)).size;
  const accessEvents = allRows.filter(
    (row) => row.action.startsWith("staff.") || row.action.startsWith("account.")
  ).length;
  const reviewEvents = allRows.filter(
    (row) =>
      row.action.includes("review") ||
      row.action.includes("accepted") ||
      row.action.includes("submitted")
  ).length;
  const hasFilters = Boolean(query || categoryFilter);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Firm controls</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Activity</h1>
          <p className="mt-2 text-slate-500">
            Review the firm audit trail for staff access, clients, organizers, documents, and tax-return workflow.
          </p>
        </div>
        <Link
          href="/dashboard/activity/export"
          className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Events shown</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{allRows.length}</p>
          <p className="mt-1 text-xs text-slate-400">Up to the most recent 1,000 events</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Team members represented</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{actorCount}</p>
          <p className="mt-1 text-xs text-slate-400">Actors in the events shown</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Access / review events</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{accessEvents + reviewEvents}</p>
          <p className="mt-1 text-xs text-slate-400">Team, submission, and review activity</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Filter audit trail</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search actors, actions, targets, and selected audit metadata.
            </p>
          </div>
          {hasFilters && (
            <Link
              href="/dashboard/activity"
              className="w-fit text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Clear filters
            </Link>
          )}
        </div>

        <form
          action="/dashboard/activity"
          method="get"
          className="mt-4 grid gap-3 md:grid-cols-[1fr_0.45fr_auto]"
        >
          <input
            name="q"
            defaultValue={firstParam(filters.q)}
            placeholder="Actor, action, target, metadata…"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <select
            name="category"
            defaultValue={categoryFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All categories</option>
            <option value="Team & access">Team & access</option>
            <option value="Clients">Clients</option>
            <option value="Organizers">Organizers</option>
            <option value="Documents">Documents</option>
            <option value="Tax returns">Tax returns</option>
            <option value="Templates">Templates</option>
            <option value="Other">Other</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply
          </button>
        </form>
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Activity could not be loaded: {error.message}
        </p>
      ) : allRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No activity recorded yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Audited staff and client workflow actions will appear here.
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Audit trail</h2>
            <p className="mt-1 text-sm text-slate-500">
              {rows.length} matching event{rows.length === 1 ? "" : "s"} · {allRows.length} loaded. Timestamps are displayed in UTC.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="font-medium text-slate-800">No audit events match these filters</p>
                <p className="mt-1 text-sm text-slate-500">Clear or adjust the filters above.</p>
              </div>
            ) : rows.map((row) => {
              const actor = row.actor;
              const href = targetHref(row);
              const eventCategory = category(row.action);
              const details = metadataSummary(row.metadata);

              return (
                <div key={row.id} className="px-5 py-4">
                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + categoryClasses(eventCategory)}>
                          {eventCategory}
                        </span>
                        <p className="font-semibold text-slate-900">{actionLabel(row.action)}</p>
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-800">{actor?.full_name ?? "System / unknown actor"}</span>
                        {actor?.staff_role ? " · " + staffRoleLabel(actor.staff_role) : ""}
                        {" · "}
                        <span className="capitalize">{targetLabel(row.target_type)}</span>
                      </p>

                      {details && (
                        <p className="mt-1 break-words text-xs leading-5 text-slate-500">{details}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-slate-400">{formatUtc(row.created_at)}</span>
                      {href && (
                        <Link href={href} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                          Open →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
