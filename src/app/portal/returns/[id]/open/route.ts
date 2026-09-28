import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client" || !profile.is_active) {
    redirect("/login");
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: storagePath, error } = await supabase.rpc(
    "record_return_copy_access",
    { p_document_id: id }
  );

  if (error || !storagePath) {
    redirect("/portal/returns");
  }

  const { data, error: signedError } = await supabase.storage
    .from("client-documents")
    .createSignedUrl(storagePath, 5 * 60);

  if (signedError || !data?.signedUrl) {
    redirect("/portal/returns");
  }

  return Response.redirect(data.signedUrl, 302);
}
