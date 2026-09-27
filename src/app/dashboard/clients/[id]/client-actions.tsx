"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { inviteClient, sendOrganizerToClient } from "./actions";
import { useEmailCooldown } from "@/lib/use-email-cooldown";

type Template = { id: string; name: string; tax_year: number };

export function InviteButton({ clientId, status }: { clientId: string; status: string }) {
  const { seconds, startCooldown } = useEmailCooldown();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (status === "archived") {
    return <span className="text-sm text-slate-500">Restore this client before sending portal access.</span>;
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        onClick={() =>
          startTransition(async () => {
            const result = await inviteClient(clientId);
            startCooldown(result.cooldownSeconds ?? 0);
            setMessage(result.error ?? result.message ?? "Invite sent.");
          })
        }
        disabled={pending || seconds > 0}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Sending…" : seconds > 0 ? `Retry in ${seconds}s` : status === "active" ? "Send sign-in link" : "Send portal invite"}
      </button>
      {message && <p role="status" className="max-w-sm text-xs text-slate-500">{message}</p>}
    </div>
  );
}

export function SendOrganizerForm({
  clientId,
  templates,
}: {
  clientId: string;
  templates: Template[];
}) {
  const currentYear = new Date().getFullYear();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [taxYear, setTaxYear] = useState(currentYear);
  const [title, setTitle] = useState(`${currentYear} Tax Organizer`);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="text-sm text-slate-600">No organizer templates are available yet.</p>
        <Link href="/dashboard/templates" className="mt-2 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700">
          Create a template →
        </Link>
      </div>
    );
  }

  const fieldClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await sendOrganizerToClient({ clientId, templateId, taxYear, title });
          setMessage(result.error ?? "Organizer sent.");
        });
      }}
      className="flex flex-col gap-4"
    >
      <label className="text-sm font-medium text-slate-700">
        Template
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={fieldClass}>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template.tax_year})
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-[0.4fr_0.6fr]">
        <label className="text-sm font-medium text-slate-700">
          Tax year
          <input type="number" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} className={fieldClass} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Title
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Sending organizer…" : "Send organizer"}
      </button>
      {message && <p className="text-sm text-slate-500">{message}</p>}
    </form>
  );
}
