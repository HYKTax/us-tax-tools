import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";

type OrganizerRow = {
  id: string;
  client_id: string;
  title: string;
  tax_year: number;
  status: string;
  sent_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  clients: {
    primary_contact_name: string;
    email: string;
  } | null;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusClasses(status: string) {
  if (status === "reviewed") return "bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "bg-blue-50 text-blue-700";
  if (status === "in_progress") return "bg-amber-50 text-amber-700";
  if (status === "sent") return "bg-violet-50 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

export default async function OrganizersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = firstParam(params.q).trim().toLowerCase();
  const statusFilter = firstParam(params.status);
  const yearFilter = firstParam(params.year);

  const profile = await getCurrentProfile();
  const canManage =
    Boolean(profile) &&
    profile!.role !== "client" &&
    hasStaffPermission(profile!, "organizers.manage");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizers")
    .select(
      "id,client_id,title,tax_year,status,sent_at,submitted_at,updated_at,clients!organizers_client_firm_fk(primary_contact_name,email)"
    )
    .order("updated_at", { ascending: false })
    .limit(1000);

  const allRows = (data ?? []) as unknown as OrganizerRow[];
  const years = Array.from(new Set(allRows.map((row) => row.tax_year))).sort(
    (a, b) => b - a
  );

  const rows = allRows.filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (yearFilter && String(row.tax_year) !== yearFilter) return false;
    if (query) {
      const searchable = [
        row.title,
        row.clients?.primary_contact_name ?? "",
        row.clients?.email ?? "",
        String(row.tax_year),
      ]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });

  const sent = allRows.filter((row) => row.status === "sent").length;
  const inProgress = allRows.filter((row) => row.status === "in_progress").length;
  const submitted = allRows.filter((row) => row.status === "submitted").length;
  const reviewed = allRows.filter((row) => row.status === "reviewed").length;
  const hasFilters = Boolean(query || statusFilter || yearFilter);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Client intake</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Organizers
          </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Track questionnaires across the firm, surface submissions ready for review, and send annual organizers in bulk.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/templates"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Templates
          </Link>
          {canManage && (
            <Link
              href="/dashboard/organizers/batch"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Batch send
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-violet-700">Not started</p>
          <p className="mt-2 text-3xl font-semibold text-violet-950">{sent}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">In progress</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{inProgress}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">Ready for review</p>
          <p className="mt-2 text-3xl font-semibold text-blue-950">{submitted}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Reviewed</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">{reviewed}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Find organizers</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search by client, email, title, or tax year.
            </p>
          </div>
          {hasFilters && (
            <Link
              href="/dashboard/organizers"
              className="w-fit text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Clear filters
            </Link>
          )}
        </div>

        <form
          action="/dashboard/organizers"
          method="get"
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"
        >
          <input
            name="q"
            defaultValue={firstParam(params.q)}
            placeholder="Client, email, title…"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 xl:col-span-2"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent / not started</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
            <option value="reviewed">Reviewed</option>
          </select>
          <select
            name="year"
            defaultValue={yearFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All years</option>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply filters
          </button>
        </form>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Organizers could not be loaded.
        </p>
      )}

      {!error && allRows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No organizers sent yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Send one from Client 360 or use batch sending to start tax-season intake.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Organizer queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              {rows.length} matching organizer{rows.length === 1 ? "" : "s"} · {allRows.length} total loaded
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Organizer</th>
                  <th className="px-5 py-3">Tax year</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Sent</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="px-5 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <p className="font-medium text-slate-800">
                        No organizers match these filters
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Clear or adjust the filters above.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {row.clients?.primary_contact_name ?? "Client"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.clients?.email ?? ""}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-700">
                        {row.title}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.tax_year}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(row.status)}`}>
                          {row.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {row.sent_at ? new Date(row.sent_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {new Date(row.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/dashboard/organizers/${row.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
