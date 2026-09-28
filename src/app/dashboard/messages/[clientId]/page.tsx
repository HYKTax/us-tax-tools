import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientMessageThread } from "@/components/client-message-thread";
import type { ClientPostedMessage } from "@/lib/actions/client-messages";

export default async function StaffClientMessagesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client" || !profile.is_active) notFound();

  const supabase = await createClient();
  const [{ data: client }, { data: messageRows }] = await Promise.all([
    supabase
      .from("clients")
      .select("id,primary_contact_name,email,status")
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("client_messages")
      .select("id,author_id,body,created_at,profiles!client_messages_author_id_fkey(full_name,role)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(100),
  ]);

  if (!client) notFound();

  const initialMessages: ClientPostedMessage[] = (messageRows ?? []).map((row) => {
    const author = row.profiles as unknown as { full_name: string; role: string } | null;
    return {
      id: row.id,
      author_id: row.author_id,
      body: row.body,
      created_at: row.created_at,
      author_name: author?.full_name ?? "Unknown",
      author_role: author?.role ?? "",
    };
  });

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link href="/dashboard/messages" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          ← Messages
        </Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-blue-600">Secure client conversation</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
              {client.primary_contact_name}
            </h1>
            <p className="mt-2 text-slate-500">{client.email}</p>
          </div>
          <Link
            href={`/dashboard/clients/${client.id}`}
            className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Client 360
          </Link>
        </div>
      </section>

      <ClientMessageThread
        clientId={client.id}
        initialMessages={initialMessages}
        currentProfileId={profile.id}
      />

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-slate-950">General client thread</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Use this conversation for client-level communication. Keep questionnaire-specific discussion inside the related organizer so context stays attached to that organizer.
        </p>
      </section>
    </div>
  );
}
