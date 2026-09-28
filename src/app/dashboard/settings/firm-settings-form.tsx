"use client";

import { useState, useTransition } from "react";
import { updateFirmSettings } from "./actions";

export function FirmSettingsForm({
  initial,
}: {
  initial: {
    name: string;
    supportEmail: string;
    supportPhone: string;
    websiteUrl: string;
    portalWelcomeMessage: string;
  };
}) {
  const [name, setName] = useState(initial.name);
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail);
  const [supportPhone, setSupportPhone] = useState(initial.supportPhone);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl);
  const [portalWelcomeMessage, setPortalWelcomeMessage] = useState(
    initial.portalWelcomeMessage
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const fieldClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        setIsError(false);

        startTransition(async () => {
          const result = await updateFirmSettings({
            name,
            supportEmail,
            supportPhone,
            websiteUrl,
            portalWelcomeMessage,
          });
          setIsError(Boolean(result.error));
          setMessage(result.error ?? result.message ?? "Settings updated.");
        });
      }}
      className="flex flex-col gap-6"
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold text-slate-950">Firm identity</h2>
        <p className="mt-1 text-sm text-slate-500">
          This information identifies the tax firm inside the client portal.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Firm name
          <input
            value={name}
            maxLength={160}
            required
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Client support email
            <input
              type="email"
              value={supportEmail}
              maxLength={320}
              placeholder="support@example.com"
              onChange={(event) => setSupportEmail(event.target.value)}
              className={fieldClass}
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Client support phone
            <input
              value={supportPhone}
              maxLength={80}
              placeholder="+1 555 555 0123"
              onChange={(event) => setSupportPhone(event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Firm website
          <input
            type="url"
            value={websiteUrl}
            maxLength={500}
            placeholder="https://example.com"
            onChange={(event) => setWebsiteUrl(event.target.value)}
            className={fieldClass}
          />
          <span className="mt-1 block text-xs text-slate-400">
            Use an https:// URL.
          </span>
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold text-slate-950">Client portal welcome</h2>
        <p className="mt-1 text-sm text-slate-500">
          Optional message shown to signed-in clients on the portal home page.
        </p>
        <textarea
          rows={5}
          maxLength={1000}
          value={portalWelcomeMessage}
          onChange={(event) => setPortalWelcomeMessage(event.target.value)}
          placeholder="Welcome to our secure client portal. Upload requested documents here and use Messages for questions."
          className={fieldClass}
        />
        <div className="mt-2 text-right text-xs text-slate-400">
          {portalWelcomeMessage.length}/1000
        </div>
      </section>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save firm settings"}
        </button>
        {message && (
          <p className={"text-sm " + (isError ? "text-red-600" : "text-emerald-700")}>
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
