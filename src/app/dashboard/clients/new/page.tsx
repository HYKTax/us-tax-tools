"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createClientRecord, type CreateClientState } from "../actions";

const initialState: CreateClientState = { status: "idle" };

export default function NewClientPage() {
  const [state, formAction, pending] = useActionState(createClientRecord, initialState);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/clients" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to clients</Link>
      <div className="mt-4">
        <p className="text-sm font-semibold text-blue-600">Client setup</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Add a client</h1>
        <p className="mt-2 text-slate-500">Create the client record first. You can send portal access and an organizer from their profile.</p>
      </div>

      <form action={formAction} className="mt-7 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <label className="text-sm font-medium text-slate-700">
          Client or primary contact name
          <input
            type="text"
            name="primary_contact_name"
            required
            placeholder="John Smith"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Email address
          <input
            type="email"
            name="email"
            required
            placeholder="john@example.com"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <span className="mt-1.5 block text-xs font-normal text-slate-500">Portal invitations will be sent to this address.</span>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Client type
          <select
            name="client_type"
            defaultValue="individual"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>
        </label>

        {state.status === "error" && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.message}</p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Adding client…" : "Add client"}
          </button>
          <Link href="/dashboard/clients" className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
