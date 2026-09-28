import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ClientContactForm,
  type ClientContactValues,
} from "@/components/client-contact-form";

export default async function ClientProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client" || !profile.is_active) notFound();

  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select(
      "id,primary_contact_name,email,client_type,phone,address_line1,address_line2,city,state_region,postal_code,country,preferred_contact_method,contact_updated_at"
    )
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (error || !client) notFound();

  const contact: ClientContactValues = {
    phone: client.phone,
    address_line1: client.address_line1,
    address_line2: client.address_line2,
    city: client.city,
    state_region: client.state_region,
    postal_code: client.postal_code,
    country: client.country,
    preferred_contact_method: client.preferred_contact_method,
    contact_updated_at: client.contact_updated_at,
  };

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Account details</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Profile
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Review the identity and contact information your tax firm has on file.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Primary contact
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {client.primary_contact_name}
          </p>
          <p className="mt-1 text-sm text-slate-500">{client.email}</p>
          <p className="mt-3 text-xs text-slate-400">
            Name and sign-in email are controlled by your firm. Send a secure message if either needs to change.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Client type
          </p>
          <p className="mt-2 text-lg font-semibold capitalize text-slate-950">
            {client.client_type}
          </p>
        </div>
      </section>

      <ClientContactForm clientId={client.id} initial={contact} />

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-slate-950">Privacy note</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Do not enter Social Security numbers, taxpayer identification numbers, passwords,
          or bank credentials in these contact fields. Use the secure document workflow for tax records.
        </p>
      </section>
    </div>
  );
}
