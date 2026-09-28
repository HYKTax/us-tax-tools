"use client";

import { useState, useTransition } from "react";
import {
  createClientNote,
  deleteClientNote,
  setClientNotePinned,
} from "./note-actions";

export type ClientNoteView = {
  id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  author_name: string;
};

export function ClientNotesPanel({
  clientId,
  notes,
  currentProfileId,
  canManageOthers,
}: {
  clientId: string;
  notes: ClientNoteView[];
  currentProfileId: string;
  canManageOthers: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function addNote(event: React.FormEvent) {
    event.preventDefault();
    const body = draft;
    setMessage(null);

    startTransition(async () => {
      const result = await createClientNote(clientId, body);
      if (result.error) {
        setMessage(result.error);
      } else {
        setDraft("");
        setMessage("Internal note saved.");
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Firm only
        </p>
        <h2 className="mt-1 font-semibold text-slate-950">Internal client notes</h2>
        <p className="mt-1 text-sm text-slate-500">
          Staff-only handoff notes. These never appear in the client portal.
        </p>
      </div>

      <form onSubmit={addNote} className="border-b border-slate-100 p-5">
        <textarea
          rows={3}
          maxLength={5000}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a private note for the firm…"
          className="w-full resize-y rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">{draft.length}/5000</p>
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add note"}
          </button>
        </div>
        {message && (
          <p className={"mt-2 text-sm " + (message === "Internal note saved." ? "text-emerald-700" : "text-red-600")}>
            {message}
          </p>
        )}
      </form>

      {notes.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No internal notes yet.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {notes.map((note) => {
            const canManage = note.author_id === currentProfileId || canManageOthers;
            return (
              <article key={note.id} className={note.is_pinned ? "bg-amber-50/50 px-5 py-4" : "px-5 py-4"}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {note.is_pinned && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Pinned
                        </span>
                      )}
                      <span className="text-xs font-medium text-slate-500">
                        {note.author_name} · {new Date(note.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                      {note.body}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await setClientNotePinned(clientId, note.id, !note.is_pinned);
                            if (result.error) setMessage(result.error);
                          })
                        }
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {note.is_pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteClientNote(clientId, note.id);
                            if (result.error) setMessage(result.error);
                          })
                        }
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
