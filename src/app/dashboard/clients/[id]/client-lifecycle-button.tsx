"use client";

import { useState, useTransition } from "react";
import { setClientArchived } from "./lifecycle-actions";

export function ClientLifecycleButton({
  clientId,
  status,
}: {
  clientId: string;
  status: string;
}) {
  const archived = status === "archived";
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await setClientArchived(clientId, !archived);
            setMessage(
              result.error ??
                (archived
                  ? "Client reactivated."
                  : "Client archived and portal access disabled.")
            );
          });
        }}
        className={
          "rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 " +
          (archived
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
        }
      >
        {pending ? "Updating…" : archived ? "Reactivate client" : "Archive client"}
      </button>
      {message && (
        <p className={"max-w-xs text-right text-xs " + (message.includes("could") || message.includes("cannot") || message.includes("not") ? "text-red-600" : "text-slate-500")}>
          {message}
        </p>
      )}
    </div>
  );
}
