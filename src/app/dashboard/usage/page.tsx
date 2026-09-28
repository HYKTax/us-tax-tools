import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";

type StorageClient = {
  id: string;
  name: string;
  documents: number;
  bytes: number;
};

type LargestFile = {
  id: string;
  name: string;
  bytes: number;
  client_name: string;
  created_at: string;
};

type UsageSummary = {
  clients: number;
  active_clients: number;
  documents: number;
  document_bytes: number;
  organizers: number;
  returns: number;
  open_returns: number;
  tasks: number;
  open_tasks: number;
  client_messages: number;
  engagements: number;
  document_requests: number;
  top_storage_clients: StorageClient[];
  largest_files: LargestFile[];
};

function bytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  );
  return (value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2) + " " + units[index];
}

export default async function UsagePage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "audit.view")) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_firm_usage_summary");
  const summary = (data ?? null) as UsageSummary | null;

  if (error || !summary) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Usage metrics could not be loaded.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Capacity monitoring</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Usage
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Firm-scoped application usage from the current portal database and tracked document sizes.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">Tracked document storage</p>
          <p className="mt-2 text-3xl font-semibold text-blue-950">{bytes(Number(summary.document_bytes))}</p>
          <p className="mt-1 text-xs text-blue-700">{summary.documents} document{summary.documents === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Clients</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.clients}</p>
          <p className="mt-1 text-xs text-slate-500">{summary.active_clients} active</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Tax returns</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.returns}</p>
          <p className="mt-1 text-xs text-slate-500">{summary.open_returns} open</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Internal tasks</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.tasks}</p>
          <p className="mt-1 text-xs text-slate-500">{summary.open_tasks} open</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Organizers</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.organizers}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Document requests</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.document_requests}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Client messages</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.client_messages}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Engagements</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.engagements}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Largest clients by document storage</h2>
            <p className="mt-1 text-sm text-slate-500">Tracked uploaded file sizes only.</p>
          </div>
          {summary.top_storage_clients.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No tracked document storage yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.top_storage_clients.map((client) => (
                <Link
                  key={client.id}
                  href={("/dashboard/clients/" + client.id) as Route}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{client.documents} document{client.documents === 1 ? "" : "s"}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{bytes(Number(client.bytes))}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Largest uploaded files</h2>
            <p className="mt-1 text-sm text-slate-500">Useful for identifying storage-heavy documents.</p>
          </div>
          {summary.largest_files.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No sized documents found.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.largest_files.map((file) => (
                <Link
                  key={file.id}
                  href={("/dashboard/documents/" + file.id) as Route}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{file.client_name}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-700">{bytes(Number(file.bytes))}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">What this measures</h2>
        <p className="mt-1 text-sm leading-6 text-amber-800">
          Document storage is calculated from file sizes recorded by this application. This page does not claim to be the provider&apos;s billing meter or remaining plan quota; use it as an internal early-warning view.
        </p>
      </section>
    </div>
  );
}
