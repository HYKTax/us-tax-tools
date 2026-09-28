import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { ClientCsvImporter } from "./client-csv-importer";

export default async function ClientImportPage() {
  const profile = await getCurrentProfile();
  if (!profile || !hasStaffPermission(profile, "clients.manage")) notFound();

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link href="/dashboard/clients" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          ← Clients
        </Link>
        <p className="mt-4 text-sm font-semibold text-blue-600">Firm onboarding</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Import clients from CSV
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Bulk-create client records without sending invitations automatically. Review the parsed rows before importing, then invite clients when you are ready.
        </p>
      </section>

      <ClientCsvImporter />
    </div>
  );
}
