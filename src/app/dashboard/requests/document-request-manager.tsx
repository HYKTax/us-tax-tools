"use client";

import { useMemo, useState, useTransition } from "react";
import { cancelDocumentRequest, createDocumentRequest } from "./actions";

type ClientOption = {
  id: string;
  primary_contact_name: string;
  email: string;
};

export type RequestView = {
  id: string;
  client_id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  received_at: string | null;
  reviewed_at: string | null;
  client_name: string;
  client_email: string;
  requester_name: string;
  document_count: number;
};

function statusClasses(status: string) {
  if (status === "reviewed") return "bg-emerald-50 text-emerald-700";
  if (status === "received") return "bg-blue-50 text-blue-700";
  if (status === "cancelled") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-700";
}

export function DocumentRequestManager({
  clients,
  requests,
}: {
  clients: ClientOption[];
  requests: RequestView[];
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [filter, setFilter] = useState<"active" | "open" | "received" | "reviewed" | "all">("active");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((request) => {
      if (filter === "active" && !["open", "received"].includes(request.status)) return false;
      if (filter !== "active" && filter !== "all" && request.status !== filter) return false;
      if (q) {
        const haystack = [
          request.title,
          request.details ?? "",
          request.client_name,
          request.client_email,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [requests, filter, query]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await createDocumentRequest({
        clientId,
        title,
        details: details || undefined,
        dueDate: dueDate || undefined,
      });

      if (result.error) {
        setMessage(result.error);
        return;
      }

      setTitle("");
      setDetails("");
      setDueDate("");
      setMessage(result.message ?? "Document request sent.");
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
      <form
        onSubmit={submit}
        className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="font-semibold text-slate-950">Request a document</h2>
        <p className="mt-1 text-sm text-slate-500">
          Send a secure request without building a full organizer.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Client
          <select
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.primary_contact_name} · {client.email}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          What do you need?
          <input
            value={title}
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="2026 W-2 from employer"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Instructions
          <textarea
            value={details}
            maxLength={5000}
            rows={4}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Optional details for the client…"
            className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Requested by date
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5"
          />
        </label>

        <button
          type="submit"
          disabled={pending || !clientId || !title.trim()}
          className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send request"}
        </button>

        {message && (
          <p className="mt-3 text-sm text-slate-600">{message}</p>
        )}
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-slate-950">Request queue</h2>
              <p className="mt-1 text-sm text-slate-500">
                {visible.length} matching request{visible.length === 1 ? "" : "s"}
              </p>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client or request…"
              className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["active", "open", "received", "reviewed", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-semibold capitalize " +
                  (filter === value
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                }
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            No requests match this view.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((request) => {
              const overdue =
                request.status === "open" &&
                request.due_date &&
                request.due_date < today;

              return (
                <article key={request.id} className="px-5 py-4">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(request.status)}`}>
                          {request.status}
                        </span>
                        {overdue && (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            Overdue
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 font-semibold text-slate-950">{request.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {request.client_name} · {request.client_email}
                      </p>
                      {request.details && (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                          {request.details}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {request.due_date && (
                          <span>Due {new Date(request.due_date + "T00:00:00").toLocaleDateString()}</span>
                        )}
                        <span>{request.document_count} uploaded file{request.document_count === 1 ? "" : "s"}</span>
                        <span>Requested by {request.requester_name}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <a
                        href={`/dashboard/clients/${request.client_id}`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Client 360
                      </a>
                      {request.status !== "cancelled" && request.status !== "reviewed" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await cancelDocumentRequest(
                                request.id,
                                request.client_id
                              );
                              setMessage(result.error ?? result.message ?? null);
                            })
                          }
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
