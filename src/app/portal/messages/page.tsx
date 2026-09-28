import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientMessageThread } from "@/components/client-message-thread";
import type { ClientPostedMessage } from "@/lib/actions/client-messages";

export default async function ClientMessagesPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client" || !profile.is_active) notFound();

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id,primary_contact_name")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!client) notFound();

  const { data: messageRows, error } = await supabase
    .from("client_messages")
    .select("id,author_id,body,created_at,profiles!client_messages_author_id_fkey(full_name,role)")
    .eq("client_id", client.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);

  const initialMessages: ClientPostedMessage[] = (messageRows ?? []).map((row) => {
    const author = row.profiles as unknown as { full_name: string; role: string } | null;
    return {
      id: row.id,
      author_id: row.author_id,
      body: row.body,
      created_at: row.created_at,
      author_name: author?.full_name ?? "Tax professional",
      author_role: author?.role ?? "",
    };
  });

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Secure communication</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Messages
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Send a secure message to your tax professional. Avoid sending tax documents by ordinary email; use the Documents area for files.
        </p>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Existing messages could not be loaded. You can retry by refreshing the page.
        </p>
      )}

      <ClientMessageThread
        clientId={client.id}
        initialMessages={initialMessages}
        currentProfileId={profile.id}
      />
    </div>
  );
}
