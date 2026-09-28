"use client";

import { useMemo, useState, useTransition } from "react";
import { sendOrganizersBatch } from "../actions";

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

type TemplateOption = {
  id: string;
  name: string;
  tax_year: number;
};

export function BatchOrganizerSender({
  clients,
  templates,
  tags,
}: {
  clients: ClientOption[];
  templates: TemplateOption[];
  tags: TagOption[];
}) {
  const initialTemplate = templates[0];
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [taxYear, setTaxYear] = useState(initialTemplate?.tax_year ?? new Date().getFullYear());
  const [title, setTitle] = useState(
    initialTemplate ? `${initialTemplate.tax_year} ${initialTemplate.name}` : `${new Date().getFullYear()} Tax Organizer`
  );
  const [clientType, setClientType] = useState("");
  const [tagId, setTagId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const visibleClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (clientType && client.client_type !== clientType) return false;
      if (tagId && !client.tag_ids.includes(tagId)) return false;
      if (!q) return true;
      return `${client.primary_contact_name} ${client.email}`.toLowerCase().includes(q);
    });
  }, [clients, clientType, tagId, query]);

  function selectVisible() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const client of visibleClients) {
        if (next.size >= 200) break;
        next.add(client.id);
      }
      return next;
    });
  }

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 200) next.add(id);
      return next;
    });
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <h2 className="font-semibold text-slate-900">Create a template first</h2>
        <p className="mt-2 text-sm text-slate-500">
          Batch sending needs at least one organizer template.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Organizer defaults</h2>
        <p className="mt-1 text-sm text-slate-500">
          One template and title will be used for every selected client.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Template
          <select
            value={templateId}
            onChange={(event) => {
              const id = event.target.value;
              setTemplateId(id);
              const template = templates.find((item) => item.id === id);
              if (template) {
                setTaxYear(template.tax_year);
                setTitle(`${template.tax_year} ${template.name}`);
              }
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.tax_year})
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-[0.35fr_0.65fr] xl:grid-cols-1">
          <label className="text-sm font-medium text-slate-700">
            Tax year
            <input
              type="number"
              value={taxYear}
              min={2000}
              max={2100}
              onChange={(event) => setTaxYear(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Organizer title
            <input
              value={title}
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
            />
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-600">
          Existing organizers with the same client, template, and tax year are skipped automatically.
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex-1 text-sm font-medium text-slate-700">
              Find active clients
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or email…"
                className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Client type
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {selected.size} selected · maximum 200 per batch
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectVisible}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
          {visibleClients.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              No active clients match this filter.
            </p>
          ) : (
            visibleClients.map((client) => (
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

        <div className="border-t border-slate-100 bg-slate-50 p-5">
          <button
            type="button"
            disabled={pending || selected.size === 0 || !templateId || !title.trim()}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await sendOrganizersBatch({
                  clientIds: Array.from(selected),
                  templateId,
                  taxYear,
                  title,
                });
                setMessage(result.error ?? result.message ?? "Batch complete.");
                if (result.success) setSelected(new Set());
              });
            }}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending
              ? "Sending…"
              : `Send to ${selected.size} client${selected.size === 1 ? "" : "s"}`}
          </button>
          {message && (
            <p className="mt-3 text-sm text-slate-600">{message}</p>
          )}
        </div>
      </section>
    </div>
  );
}
