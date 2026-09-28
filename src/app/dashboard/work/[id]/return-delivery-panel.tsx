"use client";

import { useRef, useState, useTransition } from "react";
import {
  setReturnCopyVisibility,
  uploadReturnCopy,
} from "./delivery-actions";

type ReturnCopy = {
  id: string;
  file_name: string;
  created_at: string;
  client_visible: boolean;
  released_at: string | null;
  url: string | null;
};

export function ReturnDeliveryPanel({
  jobId,
  clientId,
  jobStatus,
  hasCurrentApproval,
  canUpload,
  canRelease,
  returnCopies,
}: {
  jobId: string;
  clientId: string;
  jobStatus: string;
  hasCurrentApproval: boolean;
  canUpload: boolean;
  canRelease: boolean;
  returnCopies: ReturnCopy[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const releaseReady =
    hasCurrentApproval && ["accepted", "completed"].includes(jobStatus);

  function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage("Choose a PDF file.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    setMessage(null);

    startTransition(async () => {
      const result = await uploadReturnCopy(jobId, formData);
      setMessage(result.error ?? result.message ?? "Upload complete.");
      if (result.success && inputRef.current) inputRef.current.value = "";
    });
  }

  function changeVisibility(documentId: string, visible: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setReturnCopyVisibility({
        documentId,
        jobId,
        clientId,
        visible,
      });
      setMessage(result.error ?? result.message ?? "Document updated.");
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-sm font-semibold text-blue-600">Client delivery</p>
        <h2 className="mt-1 font-semibold text-slate-950">Final return documents</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Final PDFs stay private after upload. A Reviewer, Manager, or Firm Admin
          must explicitly release them after the return is accepted or completed.
        </p>
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-[0.72fr_1.28fr]">
        <div>
          <p className="text-sm font-semibold text-slate-900">Upload final PDF</p>
          {!canUpload ? (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              Your role cannot upload final return documents.
            </p>
          ) : !hasCurrentApproval ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              Current reviewer approval is required before a final return copy can
              be attached.
            </p>
          ) : (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                disabled={pending}
                className="mt-3 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700"
              />
              <button
                type="button"
                disabled={pending}
                onClick={upload}
                className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {pending ? "Working…" : "Upload privately"}
              </button>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                PDF only · maximum 20 MB · upload does not make the file visible to
                the client.
              </p>
            </>
          )}

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Release readiness
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {releaseReady ? "Ready for client release" : "Release locked"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {!hasCurrentApproval
                ? "A current reviewer approval is required."
                : !["accepted", "completed"].includes(jobStatus)
                  ? "Mark the filing as accepted or the return as completed first."
                  : "The return is approved and accepted/completed."}
            </p>
          </div>

          {message && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {message}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Uploaded return copies</p>
            <span className="text-xs text-slate-400">
              {returnCopies.length} file{returnCopies.length === 1 ? "" : "s"}
            </span>
          </div>

          {returnCopies.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-800">No final return PDF yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Upload the client copy after reviewer approval.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {returnCopies.map((document) => (
                <div key={document.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            "rounded-full px-2.5 py-1 text-xs font-semibold " +
                            (document.client_visible
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600")
                          }
                        >
                          {document.client_visible ? "Released to client" : "Private"}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                        {document.file_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Uploaded {new Date(document.created_at).toLocaleString()}
                        {document.released_at
                          ? " · Released " +
                            new Date(document.released_at).toLocaleString()
                          : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {document.url && (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View PDF
                        </a>
                      )}

                      {canRelease &&
                        (document.client_visible ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => changeVisibility(document.id, false)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            Withdraw
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={pending || !releaseReady}
                            onClick={() => changeVisibility(document.id, true)}
                            className="rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Release to client
                          </button>
                        ))}
                    </div>
                  </div>

                  {!canRelease && (
                    <p className="mt-3 text-xs text-slate-400">
                      Reviewer, Manager, or Firm Admin access is required to release
                      or withdraw this document.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
