import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type WorkRow = {
  id: string;
  title: string;
  tax_year: number;
  status: string;
  updated_at: string;
  client_id: string;
  clients: { primary_contact_name: string; client_type: string } | null;
};

function stageFor(status: string) {
  if (status === "draft") return { label: "Draft", classes: "bg-slate-100 text-slate-600" };
  if (status === "sent") return { label: "Waiting on client", classes: "bg-amber-50 text-amber-700" };
  if (status === "in_progress") return { label: "Client working", classes: "bg-amber-50 text-amber-700" };
  if (status === "submitted") return { label: "Ready for review", classes: "bg-blue-50 text-blue-700" };
  if (status === "reviewed") return { label: "Reviewed", classes: "bg-emerald-50 text-emerald-700" };
  return { label: status.replace("_", " "), classes: "bg-slate-100 text-slate-600" };
}

export default async function WorkPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizers")
    .select("id, title, tax_year, status, updated_at, client_id, clients!organizers_client_firm_fk(primary_contact_name, client_type)")
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as WorkRow[];
  const waiting = rows.filter((row) => row.status === "sent" || row.status === "in_progress").length;
  const ready = rows.filter((row) => row.status === "submitted").length;
  const reviewed = rows.filter((row) => row.status === "reviewed").length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Firm workflow</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Work / Returns</h1>
        <p className="mt-2 text-slate-500">
          A cross-client work queue built from your existing organizer workflow.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Open work</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{rows.length - reviewed}</p>
          <p className="mt-1 text-xs text-slate-500">All organizers not yet reviewed</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Waiting on clients</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{waiting}</p>
          <p className="mt-1 text-xs text-slate-500">Sent or in progress</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Ready for review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{ready}</p>
          <p className="mt-1 text-xs text-slate-500">Client submitted organizer</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Reviewed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{reviewed}</p>
          <p className="mt-1 text-xs text-slate-500">Completed organizer review</p>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load the work queue: {error.message}
        </p>
      )}

      {!error && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No work items yet</h2>
          <p className="mt-2 text-sm text-slate-500">Send an organizer to a client and it will appear here.</p>
          <Link href="/dashboard/clients" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Open clients
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Current work queue</h2>
            <p className="mt-1 text-sm text-slate-500">Use organizer status as the first-stage workflow until return-specific jobs are added.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Work item</th>
                  <th className="px-5 py-3">Tax year</th>
                  <th className="px-5 py-3">Stage</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const stage = stageFor(row.status);
                  return (
                    <tr key={row.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/clients/${row.client_id}`} className="font-semibold text-slate-900 hover:text-blue-600">
                          {row.clients?.primary_contact_name ?? "Client"}
                        </Link>
                        <p className="mt-1 text-xs capitalize text-slate-500">{row.clients?.client_type ?? "client"}</p>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-700">{row.title}</td>
                      <td className="px-5 py-4 text-slate-600">{row.tax_year}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stage.classes}`}>
                          {stage.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{new Date(row.updated_at).toLocaleDateString()}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/dashboard/organizers/${row.id}`} className="font-semibold text-blue-600 hover:text-blue-700">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-slate-950">Next workflow upgrade</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          This queue intentionally reuses organizer data today. The next database phase can introduce dedicated return jobs with
          return type, assignee, due date, preparation, review, e-file, extension, and completion stages.
        </p>
      </section>
    </div>
  );
}
