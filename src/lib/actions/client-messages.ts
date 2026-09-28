"use server";

import { getCurrentProfile } from "@/lib/auth";
import { scheduleNotificationEmails } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export type ClientPostedMessage = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_role: string;
};

export async function postClientMessage(
  clientId: string,
  body: string,
  requestId: string
): Promise<{ error?: string; message?: ClientPostedMessage }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authorized." };

  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 5000) {
    return { error: "Enter a message between 1 and 5000 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_client_message", {
    p_client_id: clientId,
    p_body: trimmed,
    p_request_id: requestId,
  });

  if (error || !data) {
    return { error: error?.message ?? "Couldn't send the message." };
  }

  scheduleNotificationEmails();

  return {
    message: {
      id: data.id,
      author_id: data.author_id,
      body: data.body,
      created_at: data.created_at,
      author_name: profile.full_name,
      author_role: profile.role,
    },
  };
}

export async function getClientMessages(
  clientId: string
): Promise<{ messages?: ClientPostedMessage[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_messages")
    .select("id,author_id,body,created_at,profiles!client_messages_author_id_fkey(full_name,role)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);

  if (error) return { error: "Messages could not be refreshed." };

  const messages = (data ?? []).reverse().map((row) => {
    const author = row.profiles as unknown as {
      full_name: string;
      role: string;
    } | null;

    return {
      id: row.id,
      author_id: row.author_id,
      body: row.body,
      created_at: row.created_at,
      author_name: author?.full_name ?? "Unknown",
      author_role: author?.role ?? "",
    };
  });

  return { messages };
}

export async function markClientMessagesRead(
  clientId: string,
  through: string
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "mark_client_message_notifications_read",
    {
      p_client_id: clientId,
      p_through: through,
    }
  );

  return {
    error: error ? "Read status could not be saved." : undefined,
  };
}
