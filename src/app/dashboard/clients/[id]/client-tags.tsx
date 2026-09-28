"use client";

import { useState, useTransition } from "react";
import { addClientTag, removeClientTag } from "./tag-actions";

export type ClientTagView = {
  id: string;
  name: string;
};

export function ClientTags({
  clientId,
  tags,
  canManage,
}: {
  clientId: string;
  tags: ClientTagView[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Internal only
          </p>
          <h2 className="mt-1 font-semibold text-slate-950">Client tags</h2>
          <p className="mt-1 text-sm text-slate-500">
            Segment clients for tax season and internal workflows.
          </p>
        </div>
        {canManage && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = name;
              setMessage(null);

              startTransition(async () => {
                const result = await addClientTag(clientId, value);
                if (result.error) {
                  setMessage(result.error);
                } else {
                  setName("");
                  setMessage("Tag added.");
                }
              });
            }}
            className="flex w-full gap-2 sm:w-auto"
          >
            <input
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="Add tag"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-44"
            />
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <span className="text-sm text-slate-400">No tags yet.</span>
        ) : (
          tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
            >
              {tag.name}
              {canManage && (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove ${tag.name}`}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(null);
                      const result = await removeClientTag(clientId, tag.id);
                      if (result.error) setMessage(result.error);
                    })
                  }
                  className="rounded-full px-1 text-blue-500 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {message && <p className="mt-3 text-sm text-slate-500">{message}</p>}
    </section>
  );
}
