"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type NoteResult = { error?: string; success?: boolean };

async function staffContext(clientId: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client" || !profile.is_active) {
    return { error: "Not authorized." as const };
  }

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id,firm_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client || client.firm_id !== profile.firm_id) {
    return { error: "Client not found." as const };
  }

  return { profile, supabase, client };
}

export async function createClientNote(
  clientId: string,
  body: string
): Promise<NoteResult> {
  const context = await staffContext(clientId);
  if ("error" in context) return { error: context.error };

  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 5000) {
    return { error: "Enter a note between 1 and 5000 characters." };
  }

  const { error } = await context.supabase.from("client_notes").insert({
    firm_id: context.profile.firm_id,
    client_id: clientId,
    author_id: context.profile.id,
    body: trimmed,
  });

  if (error) return { error: "The note could not be saved." };

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { success: true };
}

export async function setClientNotePinned(
  clientId: string,
  noteId: string,
  pinned: boolean
): Promise<NoteResult> {
  const context = await staffContext(clientId);
  if ("error" in context) return { error: context.error };

  const { data, error } = await context.supabase
    .from("client_notes")
    .update({ is_pinned: pinned })
    .eq("id", noteId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "You cannot update this note." };
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { success: true };
}

export async function deleteClientNote(
  clientId: string,
  noteId: string
): Promise<NoteResult> {
  const context = await staffContext(clientId);
  if ("error" in context) return { error: context.error };

  const { data, error } = await context.supabase
    .from("client_notes")
    .delete()
    .eq("id", noteId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "You cannot delete this note." };
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { success: true };
}
