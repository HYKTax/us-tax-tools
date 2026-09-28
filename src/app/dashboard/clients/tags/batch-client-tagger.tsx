"use client";

import { useMemo, useState, useTransition } from "react";
import { assignClientTagBatch } from "./actions";

type ClientOption = {
  id: string;
  primary_contact_name: string;
  email: string;
  client_type: string;
  status: string;
};

export function BatchClientTagger({
  clients,
  existingTags,
}: {
  clients: ClientOption[];
  existingTags: string[];
}) {
  const [query, setQuery] = useState("");
  const [clientType, setClientType] = useState("");
  const [status, setStatus] = useState("active");
  const [tagName, setTagName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (clientType && client.client_type !== clientType) return false;
      if (status && client.status !== status) return false;
      if (!q) return true;
      return `${client.primary_contact_name} ${client.email}`
        .toLowerCase()
        .includes(q);
    });
  }, [clients, clientType, status, query]);

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 500) next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const client of visible) {
        if (next.size >= 500) break;
        next.add(client.id);
      }
      return next;
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.65fr_1.35fr]">
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Tag selected clients</h2>
        <p className="mt-1 text-sm text-slate-500">
          Use an existing tag or create a new one. Existing assignments are skipped.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Tag
          <input
            list="existing-client-tags"
            value={tagName}
            maxLength={40}
            onChange={(event) => setTagName(event.target.value)}
            placeholder="1040"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
          <datalist id="existing-client-tags">
            {existingTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </label>

        <button
          type="button"
          disabled={pending || selected.size === 0 || !tagName.trim()}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await assignClientTagBatch({
                clientIds: Array.from(selected),
                name: tagName,
              });

              if (result.error) {
                setMessage(result.error);
              } else {
                setMessage(
                  `Assigned to ${result.assigned ?? 0} client${result.assigned === 1 ? "" : "s"}; ${result.skipped ?? 0} already had the tag.`
                );
                setSelected(new Set());
              }
            });
          }}
          className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Applying tag…" : `Tag ${selected.size} client${selected.size === 1 ? "" : "s"}`}
        </button>

        {message && (
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-700">
            {message}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email…"
              className="rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
            />
            <select
              value={clientType}
              onChange={(event) => {
                setClientType(event.target.value);
                setSelected(new Set());
              }}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">All client types</option>
              <option value="individual">Individuals</option>
              <option value="business">Businesses</option>
            </select>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setSelected(new Set());
              }}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {selected.size} selected · maximum 500 per batch
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectVisible}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[40rem] divide-y divide-slate-100 overflow-y-auto">
          {visible.map((client) => (
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
                  {client.email} · {client.client_type} · {client.status}
                </p>
              </div>
            </label>
          ))}
          {visible.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No clients match this filter.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
