"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createEngagementTemplate,
  sendEngagementToClient,
  setEngagementTemplateActive,
  withdrawEngagement,
} from "./actions";

type TemplateRow = {
  id: string;
  name: string;
  title: string;
  body: string;
  is_active: boolean;
  created_at: string;
};

type ClientRow = {
  id: string;
  primary_contact_name: string;
  email: string;
  status: string;
};

type EngagementRow = {
  id: string;
  client_id: string;
  title: string;
  status: string;
  sent_at: string;
  acknowledged_name: string | null;
  acknowledged_at: string | null;
  client_name: string;
};

export function EngagementManager({
  templates,
  clients,
  engagements,
}: {
  templates: TemplateRow[];
  clients: ClientRow[];
  engagements: EngagementRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [clientId, setClientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [filter, setFilter] = useState<"all" | "sent" | "acknowledged" | "withdrawn">("all");

  const visibleEngagements = useMemo(
    () => engagements.filter((item) => filter === "all" || item.status === filter),
    [engagements, filter]
  );

  return (
    <div className="flex flex-col gap-7">
      <section className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const result = await createEngagementTemplate({
                name: templateName,
                title: templateTitle,
                body: templateBody,
              });
              setMessage(result.error ?? "Engagement template created.");
              if (result.success) {
                setTemplateName("");
                setTemplateTitle("");
                setTemplateBody("");
              }
            });
          }}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold text-slate-950">Create engagement template</h2>
          <p className="mt-1 text-sm text-slate-500">
            Store reusable engagement or consent text for client acknowledgment.
          </p>

          <label className="mt-5 block text-sm font-medium text-slate-700">
            Template name
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              maxLength={160}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
              placeholder="2026 Individual Engagement"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Client-facing title
            <input
              value={templateTitle}
              onChange={(event) => setTemplateTitle(event.target.value)}
              maxLength={240}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
              placeholder="Tax Preparation Engagement Letter"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Engagement text
            <textarea
              value={templateBody}
              onChange={(event) => setTemplateBody(event.target.value)}
              maxLength={30000}
              rows={10}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3.5 py-3"
              placeholder="Enter the engagement terms..."
            />
          </label>

          <button
            type="submit"
            disabled={pending || !templateName.trim() || !templateTitle.trim() || !templateBody.trim()}
            className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Create template"}
          </button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const result = await sendEngagementToClient(clientId, templateId);
              setMessage(result.error ?? "Engagement sent to client portal.");
              if (result.success) {
                setClientId("");
                setTemplateId("");
              }
            });
          }}
          className="h-fit rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm"
        >
          <h2 className="font-semibold text-slate-950">Send to a client</h2>
          <p className="mt-1 text-sm text-slate-600">
            The client receives a frozen copy of the template in their portal.
          </p>

          <label className="mt-5 block text-sm font-medium text-slate-700">
            Client
            <select
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">Choose active client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.primary_contact_name} · {client.email}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Engagement template
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
            >
              <option value="">Choose template</option>
              {templates
                .filter((template) => template.is_active)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={pending || !clientId || !templateId}
            className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send engagement"}
          </button>

          <div className="mt-5 rounded-xl border border-blue-200 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Scope
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              This records a portal acknowledgment with the client&apos;s typed name and timestamp. It is not presented as an IRS Form 8879 electronic-signature workflow.
            </p>
          </div>
        </form>
      </section>

      {message && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Template library</h2>
          <p className="mt-1 text-sm text-slate-500">{templates.length} template{templates.length === 1 ? "" : "s"}</p>
        </div>
        {templates.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No engagement templates yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {templates.map((template) => (
              <div key={template.id} className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{template.name}</p>
                    <span className={
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                      (template.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }>
                      {template.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{template.title}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{template.body}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await setEngagementTemplateActive(template.id, !template.is_active);
                      setMessage(result.error ?? (template.is_active ? "Template deactivated." : "Template activated."));
                    })
                  }
                  className="w-fit rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {template.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-950">Client engagements</h2>
            <p className="mt-1 text-sm text-slate-500">{visibleEngagements.length} visible</p>
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="sent">Awaiting acknowledgment</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>

        {visibleEngagements.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No engagements match this view.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleEngagements.map((engagement) => (
              <div key={engagement.id} className="flex flex-col justify-between gap-4 px-5 py-4 lg:flex-row lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{engagement.client_name}</p>
                    <span className={
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " +
                      (engagement.status === "acknowledged"
                        ? "bg-emerald-50 text-emerald-700"
                        : engagement.status === "sent"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500")
                    }>
                      {engagement.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{engagement.title}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Sent {new Date(engagement.sent_at).toLocaleString()}
                    {engagement.acknowledged_at
                      ? " · Acknowledged " + new Date(engagement.acknowledged_at).toLocaleString()
                      : ""}
                  </p>
                  {engagement.acknowledged_name && (
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      Acknowledged by {engagement.acknowledged_name}
                    </p>
                  )}
                </div>
                {engagement.status === "sent" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await withdrawEngagement(engagement.id, engagement.client_id);
                        setMessage(result.error ?? "Engagement withdrawn.");
                      })
                    }
                    className="w-fit rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
