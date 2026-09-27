"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getOrganizerMessages, markOrganizerMessagesRead, postOrganizerMessage, type PostedMessage } from "@/lib/actions/messages";

export function MessageThread({
  organizerId,
  initialMessages,
  currentProfileId,
}: {
  organizerId: string;
  initialMessages: PostedMessage[];
  currentProfileId: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string>();
  const request = useRef<{ body: string; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let busy = false;

    async function refresh() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;

      try {
        const result = await getOrganizerMessages(organizerId);
        if (!cancelled) {
          setRefreshError(result.error);
          if (result.messages) {
            setMessages((previous) => {
              const merged = new Map(previous.map((message) => [message.id, message]));
              result.messages!.forEach((message) => merged.set(message.id, message));
              return [...merged.values()].sort(
                (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
              );
            });
          }
        }
      } catch {
        if (!cancelled) setRefreshError("Messages could not be refreshed. Your draft is preserved.");
      } finally {
        busy = false;
      }
    }

    void refresh();
    const timer = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [organizerId]);

  const latestTime = messages.at(-1)?.created_at;

  useEffect(() => {
    if (!bottom.current || !latestTime) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && document.visibilityState === "visible") {
        void markOrganizerMessagesRead(organizerId, latestTime)
          .then((result) => {
            if (!result.error) window.dispatchEvent(new Event("notifications-refresh"));
          })
          .catch(() => {});
      }
    });

    observer.observe(bottom.current);
    return () => observer.disconnect();
  }, [organizerId, latestTime]);

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const body = draft;
    if (!request.current || request.current.body !== body) {
      request.current = { body, id: crypto.randomUUID() };
    }

    const requestId = request.current.id;

    startTransition(async () => {
      let result;

      try {
        result = await postOrganizerMessage(organizerId, body, requestId);
      } catch {
        setError("Connection interrupted. Retry to confirm the message; your draft is preserved.");
        return;
      }

      if (result.error || !result.message) {
        setError(result.error ?? "Couldn't send the message.");
        return;
      }

      setMessages((previous) =>
        previous.some((message) => message.id === result.message!.id)
          ? previous
          : [...previous, result.message as PostedMessage]
      );
      setDraft("");
      request.current = null;
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="max-h-[30rem] overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-slate-700">No messages yet</p>
            <p className="mt-1 text-xs text-slate-500">Start a secure conversation about this organizer.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => {
              const isMe = message.author_id === currentProfileId;
              const bubbleClass = isMe
                ? "self-end rounded-br-md bg-blue-600 text-white"
                : "self-start rounded-bl-md border border-slate-200 bg-white text-slate-800";
              const metaClass = isMe ? "text-blue-100" : "text-slate-500";

              return (
                <li
                  key={message.id}
                  className={"max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm " + bubbleClass}
                >
                  <p className={"text-[11px] font-medium " + metaClass}>
                    {isMe ? "You" : message.author_name} · {new Date(message.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words leading-6">{message.body}</p>
                </li>
              );
            })}
          </ul>
        )}

        <div ref={bottom} className="h-px" />
      </div>

      <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
        {refreshError && <p role="status" className="mb-2 text-xs text-red-600">{refreshError}</p>}
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <textarea
            aria-label="Message"
            rows={2}
            maxLength={5000}
            disabled={pending}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a secure message…"
            className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Messages refresh automatically while this page is open.</p>
          <p className="text-[11px] text-slate-400">{draft.length}/5000</p>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
