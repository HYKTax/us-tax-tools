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

export function StaffDocumentUploader({
  firmId,
  clientId,
}: {
  firmId: string;
  clientId: string;
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
        "staff-uploads",
        crypto.randomUUID() + "-" + safeName,
      ].join("/");

      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: document, error: insertError } = await supabase
        .from("documents")
        .insert({
          firm_id: firmId,
          client_id: clientId,
          uploaded_by: userId,
          storage_path: storagePath,
          file_name: safeName,
          mime_type: file.type || null,
          size_bytes: file.size,
          document_kind: "source",
        })
        .select("id")
        .single();

      if (insertError || !document) {
        await supabase.storage.from("client-documents").remove([storagePath]);
        throw insertError ?? new Error("Document row was not created.");
      }

      setMessage("Uploaded privately to the firm document center.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
      <h2 className="font-semibold text-slate-950">Upload source documents</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Staff uploads are private to the firm by default. Link the file to a return
        from Document Center after upload.
      </p>
      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-300 bg-white px-5 py-7 text-center transition hover:border-blue-500">
        <span className="text-sm font-semibold text-slate-900">
          {uploading ? "Uploading securely…" : "Choose a document"}
        </span>
        <span className="mt-1 text-xs text-slate-500">
          PDF or image · maximum 20 MB
        </span>
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
            "mt-3 text-sm " +
            (message === "Uploaded privately to the firm document center."
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
