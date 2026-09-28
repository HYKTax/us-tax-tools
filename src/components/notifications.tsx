"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { getNotifications, markNotificationRead, type NotificationRow } from "@/lib/actions/notifications";
import { notificationLabels } from "@/lib/notification-content";

export function Notifications({
  area,
  emailConfigured,
  emailMissing = [],
}: {
  area: "dashboard" | "portal";
  emailConfigured: boolean;
  emailMissing?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const panelId = useId();

  useEffect(() => {
    let stopped = false;
    let busy = false;
    async function refresh() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const result = await getNotifications();
        if (!stopped) {
          if (!result.error) {
            setRows(result.rows);
            setUnread(result.unread);
          }
          setError(result.error);
          setLoaded(true);
        }
      } catch {
        if (!stopped) setError("Notifications could not be refreshed.");
      } finally {
        busy = false;
      }
    }

    void refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("notifications-refresh", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("notifications-refresh", refresh);
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => {
          setOpen(!open);
          window.dispatchEvent(new Event("notifications-refresh"));
        }}
        className="relative rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="absolute right-0 z-30 mt-2 max-h-[28rem] w-80 max-w-[90vw] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
            <div>
              <h2 className="font-semibold text-slate-950">Notifications</h2>
              <p className="text-xs text-slate-500">{unread} unread</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
              Close
            </button>
          </div>

          {!emailConfigured && (
            <div className="m-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              <p>Email alerts are unavailable. Portal notifications will still appear here.</p>
              {area === "dashboard" && emailMissing.length > 0 && (
                <p className="mt-1">
                  Missing Vercel configuration: <span className="font-semibold">{emailMissing.join(", ")}</span>
                </p>
              )}
            </div>
          )}
          {error && <p role="status" className="px-4 py-3 text-sm text-red-600">{error}</p>}
          {!loaded && !error && <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>}
          {loaded && rows.length === 0 && !error && <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>}

          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className={row.read_at ? "bg-white" : "bg-blue-50/50"}>
                <Link
                  href={
                    row.tax_return_job_id
                      ? `/dashboard/work/${row.tax_return_job_id}`
                      : `/${area}/organizers/${row.organizer_id}`
                  }
                  onClick={() => {
                    setOpen(false);
                    void markNotificationRead(row.id)
                      .then((result) => {
                        if (!result.error) window.dispatchEvent(new Event("notifications-refresh"));
                      })
                      .catch(() => {});
                  }}
                  className="block px-4 py-3 transition hover:bg-slate-50"
                >
                  <div className="flex items-start gap-2">
                    {!row.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                    <div>
                      <p className="text-sm font-medium text-slate-900">{notificationLabels[row.kind] ?? "Portal update"}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length === 30 && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Showing up to 30 notifications, unread first.</p>}
        </section>
      )}
    </div>
  );
}
