"use client";

import { useMemo, useState, useTransition } from "react";
import { createTaxReturnJobsBatch } from "../actions";

type ClientOption = {
  id: string;
  primary_contact_name: string;
  email: string;
  client_type: string;
  tag_ids: string[];
};

type TagOption = {
  id: string;
  name: string;
};

type StaffOption = { id: string; full_name: string };

export function BatchReturnSetup({
  clients,
  preparers,
  reviewers,
  tags,
}: {
  clients: ClientOption[];
  preparers: StaffOption[];
  reviewers: StaffOption[];
  tags: TagOption[];
}) {
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(currentYear);
  const [returnType, setReturnType] = useState("1040");
  const [clientType, setClientType] = useState("individual");
  const [tagId, setTagId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState("");
  const [preparerId, setPreparerId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (clientType && client.client_type !== clientType) return false;
      if (tagId && !client.tag_ids.includes(tagId)) return false;
      if (!q) return true;
      return `${client.primary_contact_name} ${client.email}`.toLowerCase().includes(q);
    });
  }, [clients, clientType, tagId, query]);

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 200) next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const client of visible) {
        if (next.size >= 200) break;
        next.add(client.id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold text-slate-950">Return defaults</h2>
        <p className="mt-1 text-sm text-slate-500">
          These values will be applied to every newly created return in this batch.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">
            Tax year
            <input
              type="number"
              value={taxYear}
              onChange={(event) => setTaxYear(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Return type
            <select
              value={returnType}
              onChange={(event) => setReturnType(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="1040">1040 Individual</option>
              <option value="1040-NR">1040-NR</option>
              <option value="1065">1065 Partnership</option>
              <option value="1120-S">1120-S S Corporation</option>
              <option value="1120">1120 C Corporation</option>
              <option value="1041">1041 Estate / Trust</option>
              <option value="990">990 Exempt Organization</option>
              <option value="706">706 Estate Tax</option>
              <option value="709">709 Gift Tax</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Client type filter
            <select
              value={clientType}
              onChange={(event) => {
                setClientType(event.target.value);
                setSelected(new Set());
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">All active clients</option>
              <option value="individual">Individuals</option>
              <option value="business">Businesses</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Client tag
            <select
              value={tagId}
              onChange={(event) => {
                setTagId(event.target.value);
                setSelected(new Set());
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Preparer
            <select
              value={preparerId}
              onChange={(event) => setPreparerId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">Unassigned</option>
              {preparers.map((member) => (
                <option key={member.id} value={member.id}>{member.full_name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Reviewer
            <select
              value={reviewerId}
              onChange={(event) => setReviewerId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">Unassigned</option>
              {reviewers.map((member) => (
                <option key={member.id} value={member.id}>{member.full_name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-medium text-slate-700">
              Find active clients
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email…"
                className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectVisible}
                className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {selected.size} selected · maximum 200 per batch · existing matching returns are skipped.
          </p>
        </div>

        <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-100">
          {visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No active clients match this filter.
            </p>
          ) : (
            visible.map((client) => (
              <label
                key={client.id}
                className="flex cursor-pointer items-center gap-3 px-5 py-3.5 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(client.id)}
                  onChange={() => toggle(client.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {client.primary_contact_name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {client.email} · {client.client_type}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
      </section>

      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="font-semibold text-slate-950">Create selected returns</p>
          <p className="mt-1 text-sm text-slate-600">
            One database insert creates the new work records; existing matches are left unchanged.
          </p>
        </div>
        <button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await createTaxReturnJobsBatch({
                clientIds: Array.from(selected),
                taxYear,
                returnType,
                dueDate: dueDate || undefined,
                preparerId: preparerId || undefined,
                reviewerId: reviewerId || undefined,
              });
              setMessage(result.error ?? result.message ?? "Batch complete.");
              if (result.success) setSelected(new Set());
            });
          }}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : `Create ${selected.size} return${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>

      {message && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p>
      )}
    </div>
  );
}
