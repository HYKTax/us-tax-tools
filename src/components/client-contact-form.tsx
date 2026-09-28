"use client";

import { useState, useTransition } from "react";
import { updateClientContact } from "@/lib/actions/client-contact";

export type ClientContactValues = {
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  preferred_contact_method: string;
  contact_updated_at: string | null;
};

export function ClientContactForm({
  clientId,
  initial,
  editable = true,
  title = "Contact & mailing details",
  helper = "Keep the contact details used by your tax firm up to date.",
}: {
  clientId: string;
  initial: ClientContactValues;
  editable?: boolean;
  title?: string;
  helper?: string;
}) {
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [addressLine1, setAddressLine1] = useState(initial.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(initial.address_line2 ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [stateRegion, setStateRegion] = useState(initial.state_region ?? "");
  const [postalCode, setPostalCode] = useState(initial.postal_code ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [preferredContactMethod, setPreferredContactMethod] = useState<
    "portal" | "email" | "phone"
  >(
    initial.preferred_contact_method === "email" ||
      initial.preferred_contact_method === "phone"
      ? initial.preferred_contact_method
      : "portal"
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const fieldClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p>
        </div>
        {initial.contact_updated_at && (
          <span className="shrink-0 text-xs text-slate-400">
            Updated {new Date(initial.contact_updated_at).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Phone
          <input
            value={phone}
            maxLength={40}
            disabled={!editable || pending}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+1 555 123 4567"
            className={fieldClass}
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Preferred contact
          <select
            value={preferredContactMethod}
            disabled={!editable || pending}
            onChange={(event) =>
              setPreferredContactMethod(
                event.target.value as "portal" | "email" | "phone"
              )
            }
            className={fieldClass}
          >
            <option value="portal">Secure portal</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Address line 1
        <input
          value={addressLine1}
          maxLength={200}
          disabled={!editable || pending}
          onChange={(event) => setAddressLine1(event.target.value)}
          className={fieldClass}
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Address line 2
        <input
          value={addressLine2}
          maxLength={200}
          disabled={!editable || pending}
          onChange={(event) => setAddressLine2(event.target.value)}
          className={fieldClass}
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          City
          <input
            value={city}
            maxLength={100}
            disabled={!editable || pending}
            onChange={(event) => setCity(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          State / region
          <input
            value={stateRegion}
            maxLength={100}
            disabled={!editable || pending}
            onChange={(event) => setStateRegion(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Postal code
          <input
            value={postalCode}
            maxLength={30}
            disabled={!editable || pending}
            onChange={(event) => setPostalCode(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Country
          <input
            value={country}
            maxLength={100}
            disabled={!editable || pending}
            onChange={(event) => setCountry(event.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      {editable && (
        <div className="mt-5 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await updateClientContact({
                  clientId,
                  phone,
                  addressLine1,
                  addressLine2,
                  city,
                  stateRegion,
                  postalCode,
                  country,
                  preferredContactMethod,
                });
                setMessage(
                  result.error ?? (result.success ? "Contact details saved." : null)
                );
              });
            }}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save contact details"}
          </button>
          {message && (
            <p
              className={
                "text-sm " +
                (message === "Contact details saved."
                  ? "text-emerald-700"
                  : "text-red-600")
              }
            >
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
