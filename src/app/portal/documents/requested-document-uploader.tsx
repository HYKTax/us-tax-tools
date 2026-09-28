"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function RequestedDocumentUploader({
  firmId,
  clientId,
  requestId,
  compact = false,
}: {
  firmId: string;
  clientId: string;
  requestId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setMessage(null);

    try {
      if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
        throw new Error("Choose a file no larger than 20 MB.");
      }

      if (!allowedTypes.has(file.type)) {
        throw new Error("Choose a PDF, JPEG, PNG, WebP, or GIF file.");
      }

      const supabase = createClient();
      const { data: claims, error: authError } = await supabase.auth.getClaims();
      const userId = claims?.claims?.sub;

      if (authError || !userId) {
        throw new Error("Please sign in again before uploading.");
      }

      const safeName =
        file.name
          .replace(/[\\/]+/g, "-")
          .replace(/[^a-zA-Z0-9._ -]+/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140) || "document";

      const storagePath = [
        firmId,
        clientId,
        "requests",
        requestId,
        crypto.randomUUID() + "-" + safeName,
      ].join("/");

      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("documents").insert({
        firm_id: firmId,
        client_id: clientId,
        uploaded_by: userId,
        storage_path: storagePath,
        file_name: safeName,
        mime_type: file.type || null,
        size_bytes: file.size,
        document_kind: "source",
        document_request_id: requestId,
      });

      if (insertError) {
        await supabase.storage.from("client-documents").remove([storagePath]);
        throw insertError;
      }

      setMessage("Requested document uploaded.");
      window.dispatchEvent(new Event("notifications-refresh"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={compact ? "" : "rounded-xl border border-blue-100 bg-blue-50 p-4"}>
      <label className="inline-flex cursor-pointer items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
        {uploading ? "Uploading…" : "Upload requested document"}
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
          disabled={uploading}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </label>
      {message && (
        <p
          className={
            "mt-2 text-sm " +
            (message === "Requested document uploaded."
              ? "text-emerald-700"
              : "text-red-600")
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
