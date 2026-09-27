"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveResponse, submitOrganizerAction } from "./actions";

type DocRow = {
  id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
  url: string | null;
};

export type ItemWithResponse = {
  id: string;
  sort_order: number;
  section_title: string | null;
  prompt: string;
  help_text: string | null;
  response_type: "text" | "number" | "boolean" | "select" | "file";
  options: { choices?: string[] } | null;
  is_required: boolean;
  value: unknown;
  documents: DocRow[];
};

function isAnswered(item: ItemWithResponse) {
  if (item.response_type === "file") return item.documents.length > 0;
  return item.value !== null && item.value !== undefined && item.value !== "";
}

export function OrganizerForm({
  organizerId,
  firmId,
  clientId,
  items,
  readOnly,
}: {
  organizerId: string;
  firmId: string;
  clientId: string;
  items: ItemWithResponse[];
  readOnly: boolean;
}) {
  const [submitPending, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(
    () => new Set(items.filter(isAnswered).map((item) => item.id))
  );

  const completed = answeredIds.size;
  const progress = items.length === 0 ? 100 : Math.round((completed / items.length) * 100);
  const requiredRemaining = items.filter(
    (item) => item.is_required && !answeredIds.has(item.id)
  ).length;

  function updateAnswered(itemId: string, answered: boolean) {
    setAnsweredIds((previous) => {
      const next = new Set(previous);
      if (answered) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-semibold text-slate-900">{readOnly ? "Organizer complete" : "Your progress"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {completed} of {items.length} items completed
              {!readOnly && requiredRemaining > 0 ? " · " + requiredRemaining + " required remaining" : ""}
            </p>
          </div>
          <span className="font-semibold text-blue-600">{progress}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: String(progress) + "%" }} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {items.map((item, index) => {
          const previousSectionTitle = items[index - 1]?.section_title ?? null;
          const showSectionHeader = Boolean(item.section_title) && item.section_title !== previousSectionTitle;

          return (
            <div key={item.id} className="flex flex-col gap-3">
              {showSectionHeader && (
                <div className={index === 0 ? "" : "mt-4"}>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Section</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">{item.section_title}</h2>
                </div>
              )}
              <ItemField
                item={item}
                organizerId={organizerId}
                firmId={firmId}
                clientId={clientId}
                readOnly={readOnly}
                onAnsweredChange={(answered) => updateAnswered(item.id, answered)}
              />
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="border-t border-slate-100 pt-5">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {requiredRemaining > 0
                ? "Complete the remaining " + requiredRemaining + " required item" + (requiredRemaining === 1 ? "" : "s") + " before submitting."
                : "All required items are complete. You can submit this organizer for review."}
            </p>
            <button
              onClick={() => {
                setSubmitError(null);
                startSubmit(async () => {
                  const result = await submitOrganizerAction(organizerId);
                  if (result.error) setSubmitError(result.error);
                });
              }}
              disabled={submitPending}
              className="shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitPending ? "Submitting…" : "Submit organizer"}
            </button>
          </div>
          {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
        </div>
      )}
    </div>
  );
}

function ItemField({
  item,
  organizerId,
  firmId,
  clientId,
  readOnly,
  onAnsweredChange,
}: {
  item: ItemWithResponse;
  organizerId: string;
  firmId: string;
  clientId: string;
  readOnly: boolean;
  onAnsweredChange: (answered: boolean) => void;
}) {
  const [value, setValue] = useState(item.value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function commit(next: unknown) {
    setValue(next);
    setErrorMessage(null);
    setStatus("saving");
    startTransition(async () => {
      const result = await saveResponse(item.id, next);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
      } else {
        setStatus("saved");
        onAnsweredChange(next !== null && next !== undefined && next !== "");
      }
    });
  }

  const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  const label = (
    <div>
      <p className="text-sm font-semibold text-slate-900">
        {item.prompt}
        {item.is_required && <span className="ml-1 text-red-500">*</span>}
      </p>
      {item.help_text && <p className="mt-1 text-xs leading-5 text-slate-500">{item.help_text}</p>}
    </div>
  );

  const statusLine = (
    <div className="mt-2 h-4 text-xs">
      {status === "saving" && <span className="text-slate-500">Saving…</span>}
      {status === "saved" && <span className="font-medium text-emerald-600">✓ Saved</span>}
      {status === "error" && <span className="text-red-600">{errorMessage}</span>}
    </div>
  );

  if (readOnly) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {label}
        <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3">
          {item.response_type === "file" ? (
            item.documents.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {item.documents.map((document) => (
                  <li key={document.id} className="text-sm">
                    {document.url ? (
                      <a
                        href={document.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {document.file_name} ↗
                      </a>
                    ) : (
                      <span className="text-slate-700">{document.file_name}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No file uploaded</p>
            )
          ) : (
            <p className="whitespace-pre-wrap text-sm text-slate-700">{String(value ?? "No response")}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition focus-within:border-blue-200 focus-within:shadow-sm">
      {label}
      <div className="mt-3">
        {item.response_type === "text" && (
          <input
            type="text"
            defaultValue={typeof value === "string" ? value : ""}
            onBlur={(event) => commit(event.target.value)}
            className={fieldClass}
          />
        )}

        {item.response_type === "number" && (
          <input
            type="number"
            defaultValue={typeof value === "number" ? value : ""}
            onBlur={(event) => commit(event.target.value === "" ? null : Number(event.target.value))}
            className={fieldClass}
          />
        )}

        {item.response_type === "boolean" && (
          <select
            defaultValue={value === true ? "true" : value === false ? "false" : ""}
            onChange={(event) => commit(event.target.value === "true")}
            className={fieldClass}
          >
            <option value="" disabled>Choose one</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        )}

        {item.response_type === "select" &&
          (item.options?.choices?.length ? (
            <select
              defaultValue={typeof value === "string" ? value : ""}
              onChange={(event) => commit(event.target.value)}
              className={fieldClass}
            >
              <option value="" disabled>Choose one</option>
              {item.options.choices.map((choice) => (
                <option key={choice} value={choice}>{choice}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              defaultValue={typeof value === "string" ? value : ""}
              onBlur={(event) => commit(event.target.value)}
              className={fieldClass}
            />
          ))}

        {item.response_type === "file" && (
          <FileField
            item={item}
            organizerId={organizerId}
            firmId={firmId}
            clientId={clientId}
            onUploaded={() => onAnsweredChange(true)}
          />
        )}
      </div>
      {item.response_type !== "file" && statusLine}
    </div>
  );
}

function FileField({
  item,
  organizerId,
  firmId,
  clientId,
  onUploaded,
}: {
  item: ItemWithResponse;
  organizerId: string;
  firmId: string;
  clientId: string;
  onUploaded: () => void;
}) {
  const [documents, setDocuments] = useState(item.documents);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);

    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("Choose a file no larger than 20 MB.");
      }

      if (!["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
        throw new Error("Choose a PDF, JPEG, PNG, WebP, or GIF file.");
      }

      const supabase = createClient();
      const { data: claims, error: authError } = await supabase.auth.getClaims();
      if (authError || !claims?.claims?.sub) {
        throw new Error("Please sign in again before uploading.");
      }

      const path = [firmId, clientId, crypto.randomUUID() + "-" + file.name].join("/");

      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: docRow, error: insertError } = await supabase
        .from("documents")
        .insert({
          uploaded_by: claims.claims.sub,
          firm_id: firmId,
          client_id: clientId,
          organizer_id: organizerId,
          organizer_item_id: item.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        .select("id, file_name, storage_path, created_at")
        .single();

      if (insertError) throw insertError;

      const { data: signed } = await supabase.storage
        .from("client-documents")
        .createSignedUrl(path, 60 * 60);

      setDocuments((previous) => [...previous, { ...docRow, url: signed?.signedUrl ?? null }]);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {documents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span aria-hidden="true">✓</span>
              {document.url ? (
                <a href={document.url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold hover:underline">
                  {document.file_name}
                </a>
              ) : (
                <span className="truncate">{document.file_name}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
        <span className="text-sm font-semibold text-slate-800">{uploading ? "Uploading…" : "Choose a document to upload"}</span>
        <span className="mt-1 text-xs text-slate-500">PDF or image · maximum 20 MB</span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
          aria-label={"Upload a file for " + item.prompt}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
            event.target.value = "";
          }}
          disabled={uploading}
          className="sr-only"
        />
      </label>

      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
