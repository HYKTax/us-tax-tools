"use client";

import { useState, useTransition } from "react";
import {
  acceptExtractionToReturn,
  linkDocumentToReturn,
  markDocumentReviewed,
  markExtractionReviewed,
  runDocumentExtraction,
} from "./actions";

type ReturnOption = {
  id: string;
  tax_year: number;
  return_type: string;
  status: string;
};

type ActionResponse = {
  error?: string;
  success?: boolean;
  message?: string;
};

export function DocumentReviewActions({
  documentId,
  currentReturnJobId,
  returnJobs,
  documentReviewed,
  extractionCompleted,
  extractionReviewed,
  acceptedFieldCount,
  aiConfigured,
  canManageDocuments,
  canRunAi,
  canReviewDocuments,
  canApproveReturnData,
}: {
  documentId: string;
  currentReturnJobId: string | null;
  returnJobs: ReturnOption[];
  documentReviewed: boolean;
  extractionCompleted: boolean;
  extractionReviewed: boolean;
  acceptedFieldCount: number;
  aiConfigured: boolean;
  canManageDocuments: boolean;
  canRunAi: boolean;
  canReviewDocuments: boolean;
  canApproveReturnData: boolean;
}) {
  const [returnJobId, setReturnJobId] = useState(currentReturnJobId ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (action: () => Promise<ActionResponse>, successMessage: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.error ?? result.message ?? successMessage);
    });
  };

  const canAccept =
    Boolean(currentReturnJobId) &&
    documentReviewed &&
    extractionCompleted &&
    extractionReviewed;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-slate-900">Tax return link</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Attach this source document to the return it supports.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={returnJobId}
            onChange={(event) => setReturnJobId(event.target.value)}
            disabled={pending || !canManageDocuments}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Not linked to a return</option>
            {returnJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.tax_year} {job.return_type} · {job.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !canManageDocuments}
            onClick={() =>
              run(
                () => linkDocumentToReturn(documentId, returnJobId || null),
                "Document link updated."
              )
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Save link
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <p className="text-sm font-semibold text-slate-900">AI extraction</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Extraction is a draft for human review. It does not calculate a tax return or replace source-document verification.
        </p>

        {!canRunAi ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Your role can view extraction results but cannot run AI extraction.
          </p>
        ) : !aiConfigured ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            AI extraction is disabled until OPENAI_API_KEY is added to the Vercel project.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !aiConfigured || !canRunAi}
            onClick={() =>
              run(
                () => runDocumentExtraction(documentId),
                "AI extraction completed. Review the extracted fields below."
              )
            }
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Working…" : extractionCompleted ? "Re-run extraction" : "Extract with AI"}
          </button>

          {extractionCompleted && !extractionReviewed && canReviewDocuments && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => markExtractionReviewed(documentId),
                  "AI extraction marked reviewed."
                )
              }
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              Mark AI data reviewed
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <p className="text-sm font-semibold text-slate-900">Document review</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Mark the underlying source document reviewed after checking it against the extracted data and return work.
        </p>
        {!documentReviewed && canReviewDocuments ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => markDocumentReviewed(documentId),
                "Document marked reviewed."
              )
            }
            className="mt-3 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Mark document reviewed
          </button>
        ) : documentReviewed ? (
          <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            ✓ Document reviewed
          </span>
        ) : (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Reviewer or Manager approval is required to mark this source document reviewed.
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Approved return data</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Only human-reviewed fields are copied into this trusted layer for future tax-software export.
            </p>
          </div>
          {acceptedFieldCount > 0 && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {acceptedFieldCount} approved
            </span>
          )}
        </div>

        {(!canAccept || !canApproveReturnData) && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {!canApproveReturnData
              ? "Reviewer or Manager approval is required before extracted data can enter the trusted return layer."
              : !currentReturnJobId
                ? "Link this document to a tax return first."
              : !extractionCompleted
                ? "Run AI extraction first."
                : !extractionReviewed
                  ? "Human-review the AI extraction first."
                  : "Mark the original document reviewed first."}
          </p>
        )}

        <button
          type="button"
          disabled={pending || !canAccept || !canApproveReturnData}
          onClick={() =>
            run(
              () => acceptExtractionToReturn(documentId),
              "Reviewed fields accepted into return data."
            )
          }
          className="mt-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {acceptedFieldCount > 0 ? "Refresh approved fields" : "Accept fields into return data"}
        </button>
      </div>

      {message && <p className="text-sm text-slate-500">{message}</p>}
    </div>
  );
}
