import Link from "next/link";
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

function targetHref(row: AuditRow) {
  if (row.target_type === "client") return "/dashboard/clients/" + row.target_id;
  if (row.target_type === "document") return "/dashboard/documents/" + row.target_id;
  if (row.target_type === "organizer") return "/dashboard/organizers/" + row.target_id;
  if (row.target_type === "tax_return_job") return "/dashboard/work/" + row.target_id;
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

export default async function ActivityPage() {
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
    .limit(200);

  const rows = (data ?? []) as unknown as AuditRow[];
  const actorCount = new Set(rows.map((row) => row.actor_id)).size;
  const accessEvents = rows.filter(
    (row) => row.action.startsWith("staff.") || row.action.startsWith("account.")
  ).length;
  const reviewEvents = rows.filter(
    (row) =>
      row.action.includes("review") ||
      row.action.includes("accepted") ||
      row.action.includes("submitted")
  ).length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Firm controls</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Activity</h1>
        <p className="mt-2 text-slate-500">
          Review the firm audit trail for staff access, clients, organizers, documents, and tax-return workflow.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Events shown</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{rows.length}</p>
          <p className="mt-1 text-xs text-slate-400">Most recent 200 events</p>
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

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Activity could not be loaded: {error.message}
        </p>
      ) : rows.length === 0 ? (
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
              Timestamps are displayed in UTC so the record remains unambiguous across remote staff.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
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
