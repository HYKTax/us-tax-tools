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

function statusClasses(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "invited") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default async function ClientsPage() {
  const profile = await getCurrentProfile();
  const canManageClients = Boolean(profile && hasStaffPermission(profile, "clients.manage"));
  const supabase = await createClient();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, primary_contact_name, email, client_type, status")
    .order("primary_contact_name");

  const rows = (clients ?? []) as ClientRow[];
  const active = rows.filter((client) => client.status === "active").length;
  const invited = rows.filter((client) => client.status === "invited").length;

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Client management</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Clients</h1>
          <p className="mt-2 text-slate-500">Manage portal access, organizers, documents, and client activity.</p>
        </div>
        {canManageClients && (
          <Link
            href="/dashboard/clients/new"
            className="inline-flex w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + Add client
          </Link>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
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
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load clients: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
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

      {rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">All clients</h2>
            <p className="mt-1 text-sm text-slate-500">Open a client to review their portal and tax organizer activity.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Portal status</th>
                  <th className="px-5 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((client) => (
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
