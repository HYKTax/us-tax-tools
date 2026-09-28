import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";

type ClientRow = {
  id: string;
  primary_contact_name: string;
  email: string;
  client_type: string;
  status: string;
};

type ClientReturnSignal = {
  client_id: string;
  status: string;
  due_date: string | null;
};

type ClientDocumentSignal = {
  client_id: string;
  status: string;
};

function statusClasses(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "invited") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await searchParams;
  const query = firstParam(filters.q).trim().toLowerCase();
  const statusFilter = firstParam(filters.status);
  const typeFilter = firstParam(filters.type);
  const attentionFilter = firstParam(filters.attention);
  const profile = await getCurrentProfile();
  const canManageClients = Boolean(profile && hasStaffPermission(profile, "clients.manage"));
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: clients, error },
    { data: returnSignals },
    { data: documentSignals },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, primary_contact_name, email, client_type, status")
      .order("primary_contact_name")
      .limit(1000),
    supabase
      .from("tax_return_jobs")
      .select("client_id,status,due_date")
      .limit(2000),
    supabase
      .from("documents")
      .select("client_id,status")
      .eq("status", "pending_review")
      .neq("document_kind", "return_copy")
      .limit(2000),
  ]);

  const allRows = (clients ?? []) as ClientRow[];
  const returns = (returnSignals ?? []) as ClientReturnSignal[];
  const documents = (documentSignals ?? []) as ClientDocumentSignal[];

  const attentionReasons = new Map<string, Set<string>>();
  const addReason = (clientId: string, reason: string) => {
    const reasons = attentionReasons.get(clientId) ?? new Set<string>();
    reasons.add(reason);
    attentionReasons.set(clientId, reasons);
  };

  for (const item of returns) {
    if (item.status === "waiting_on_client") addReason(item.client_id, "Waiting on client");
    if (item.status === "rejected") addReason(item.client_id, "Filing issue");
    if (
      item.due_date &&
      item.due_date < today &&
      !["accepted", "completed"].includes(item.status)
    ) {
      addReason(item.client_id, "Overdue return");
    }
  }

  for (const item of documents) {
    addReason(item.client_id, "Document review");
  }

  const rows = allRows.filter((client) => {
    if (query) {
      const searchable = `${client.primary_contact_name} ${client.email}`.toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    if (statusFilter && client.status !== statusFilter) return false;
    if (typeFilter && client.client_type !== typeFilter) return false;
    if (attentionFilter === "needs_attention" && !attentionReasons.has(client.id)) return false;
    return true;
  });

  const active = allRows.filter((client) => client.status === "active").length;
  const invited = allRows.filter((client) => client.status === "invited").length;
  const needsAttention = allRows.filter((client) => attentionReasons.has(client.id)).length;
  const hasFilters = Boolean(query || statusFilter || typeFilter || attentionFilter);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Client management</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Clients</h1>
          <p className="mt-2 text-slate-500">Manage portal access, organizers, documents, and client activity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/clients/export"
            className="inline-flex w-fit rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </Link>
          {canManageClients && (
            <Link
              href="/dashboard/clients/import"
              className="inline-flex w-fit rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Import CSV
            </Link>
          )}
          {canManageClients && (
            <Link
              href="/dashboard/clients/new"
              className="inline-flex w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              + Add client
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total clients</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{rows.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active portal users</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{active}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awaiting portal access</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{invited}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Needs attention</p>
          <p className="mt-2 text-2xl font-semibold text-amber-950">{needsAttention}</p>
          <p className="mt-1 text-xs text-amber-700">Waiting, overdue, filing, or document-review work</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Find clients</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search by name or email and focus on clients that need action.
            </p>
          </div>
          {hasFilters && (
            <Link href="/dashboard/clients" className="w-fit text-sm font-semibold text-blue-600 hover:text-blue-700">
              Clear filters
            </Link>
          )}
        </div>
        <form action="/dashboard/clients" method="get" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            name="q"
            defaultValue={firstParam(filters.q)}
            placeholder="Name or email…"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 xl:col-span-2"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All portal statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="archived">Archived</option>
          </select>
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All client types</option>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>
          <select
            name="attention"
            defaultValue={attentionFilter}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="">All attention levels</option>
            <option value="needs_attention">Needs attention</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 md:col-span-2 xl:col-span-1"
          >
            Apply filters
          </button>
        </form>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load clients: {error.message}
        </p>
      )}

      {!error && allRows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No clients yet</h2>
          <p className="mt-2 text-sm text-slate-500">Add your first client to send a secure portal invitation and organizer.</p>
          {canManageClients ? (
            <Link href="/dashboard/clients/new" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              Add first client
            </Link>
          ) : (
            <p className="mt-4 text-xs text-slate-400">Manager, Preparer, or Firm Admin access is required to create clients.</p>
          )}
        </div>
      )}

      {allRows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">All clients</h2>
            <p className="mt-1 text-sm text-slate-500">
              {rows.length} matching client{rows.length === 1 ? "" : "s"} · {allRows.length} total loaded.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Portal status</th>
                  <th className="px-5 py-3">Attention</th>
                  <th className="px-5 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <p className="font-medium text-slate-800">No clients match these filters</p>
                      <p className="mt-1 text-sm text-slate-500">Clear or adjust the filters above.</p>
                    </td>
                  </tr>
                ) : rows.map((client) => (
                  <tr key={client.id} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/clients/${client.id}`} className="font-semibold text-slate-900 hover:text-blue-600">
                        {client.primary_contact_name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{client.email}</td>
                    <td className="px-5 py-4 capitalize text-slate-600">{client.client_type}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(client.status)}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {attentionReasons.has(client.id) ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from(attentionReasons.get(client.id) ?? []).slice(0, 2).map((reason) => (
                            <span key={reason} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Clear</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/dashboard/clients/${client.id}`} className="font-semibold text-blue-600 hover:text-blue-700">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
