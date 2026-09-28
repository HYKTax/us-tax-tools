import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { BatchDocumentRequestForm } from "./batch-document-request-form";

export default async function BatchDocumentRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "documents.manage")) notFound();

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id,primary_contact_name,email,client_type")
    .eq("status", "active")
    .order("primary_contact_name")
    .limit(1000);

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link
          href="/dashboard/requests"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Document requests
        </Link>
        <p className="mt-4 text-sm font-semibold text-blue-600">Tax-season collection</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Batch document requests
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Request the same tax document from many active clients at once. Each client receives an individual secure request and notification.
        </p>
      </section>

      <BatchDocumentRequestForm clients={clients ?? []} />
    </div>
  );
}
