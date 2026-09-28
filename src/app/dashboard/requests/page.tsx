import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import {
  DocumentRequestManager,
  type RequestView,
} from "./document-request-manager";

export default async function DocumentRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "documents.manage")) notFound();

  const supabase = await createClient();
  const [{ data: clients }, { data: requestRows }] = await Promise.all([
    supabase
      .from("clients")
      .select("id,primary_contact_name,email")
      .eq("status", "active")
      .order("primary_contact_name")
      .limit(1000),
    supabase
      .from("document_requests")
      .select(
        "id,client_id,title,details,due_date,status,created_at,received_at,reviewed_at,client:clients!document_requests_client_id_fkey(primary_contact_name,email),requester:profiles!document_requests_requested_by_fkey(full_name),documents(id)"
      )
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const requests: RequestView[] = (requestRows ?? []).map((row) => {
    const client = row.client as unknown as {
      primary_contact_name: string;
      email: string;
    } | null;
    const requester = row.requester as unknown as { full_name: string } | null;

    return {
      id: row.id,
      client_id: row.client_id,
      title: row.title,
      details: row.details,
      due_date: row.due_date,
      status: row.status,
      created_at: row.created_at,
      received_at: row.received_at,
      reviewed_at: row.reviewed_at,
      client_name: client?.primary_contact_name ?? "Client",
      client_email: client?.email ?? "",
      requester_name: requester?.full_name ?? "Staff",
      document_count: Array.isArray(row.documents) ? row.documents.length : 0,
    };
  });

  const open = requests.filter((row) => row.status === "open").length;
  const received = requests.filter((row) => row.status === "received").length;
  const reviewed = requests.filter((row) => row.status === "reviewed").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = requests.filter(
    (row) => row.status === "open" && row.due_date && row.due_date < today
  ).length;

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Document collection</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Document requests
        </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Request individual tax documents securely without creating a full organizer.
            Client uploads attach directly to the request and flow into Document Center.
          </p>
        </div>
        <a
          href="/dashboard/requests/batch"
          className="w-fit rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
        >
          Batch requests
        </a>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Waiting on client</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{open}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">Received</p>
          <p className="mt-2 text-3xl font-semibold text-blue-950">{received}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Reviewed</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">{reviewed}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Overdue requests</p>
          <p className="mt-2 text-3xl font-semibold text-red-950">{overdue}</p>
        </div>
      </section>

      <DocumentRequestManager
        clients={clients ?? []}
        requests={requests}
      />
    </div>
  );
}
