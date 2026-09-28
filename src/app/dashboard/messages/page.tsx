import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ClientMessageRow = {
  id: string;
  client_id: string;
  body: string;
  created_at: string;
  author: { full_name: string; role: string } | null;
  client: { primary_contact_name: string; email: string } | null;
};

export default async function MessagesPage() {
  const supabase = await createClient();

  const [{ data: clientRows, error: clientError }, { data: organizerRows, error: organizerError }] =
    await Promise.all([
      supabase
        .from("client_messages")
        .select(
          "id,client_id,body,created_at,author:profiles!client_messages_author_id_fkey(full_name,role),client:clients!client_messages_client_id_fkey(primary_contact_name,email)"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("organizer_messages")
        .select(
          "id,organizer_id,body,created_at,profiles(full_name,role),organizers(title,client_id,clients!organizers_client_firm_fk(primary_contact_name))"
        )
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  const latestByClient = new Map<string, ClientMessageRow>();
  for (const raw of clientRows ?? []) {
    const row = raw as unknown as ClientMessageRow;
    if (!latestByClient.has(row.client_id)) latestByClient.set(row.client_id, row);
  }
  const clientConversations = Array.from(latestByClient.values());

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Communication</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Messages</h1>
        <p className="mt-2 text-slate-500">
          General client conversations and organizer-specific discussions in one inbox.
        </p>
      </section>

      {(clientError || organizerError) && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Some conversations could not be loaded.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Client conversations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Secure general messages that are not tied to a specific organizer.
          </p>
        </div>

        {clientConversations.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">No general client messages yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Start a conversation from a Client 360 profile.
            </p>
            <Link
              href="/dashboard/clients"
              className="mt-4 inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open clients
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {clientConversations.map((message) => (
              <Link
                key={message.client_id}
                href={`/dashboard/messages/${message.client_id}`}
                className="block px-5 py-4 transition hover:bg-slate-50"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {message.client?.primary_contact_name ?? "Client"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {message.client?.email ?? ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">
                      {message.body}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {message.author?.full_name ?? "Unknown"} ·{" "}
                      {new Date(message.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-blue-600">
                    Open conversation →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Organizer conversations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Questionnaire-specific messages kept with the related organizer.
          </p>
        </div>

        {!organizerRows?.length ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No organizer messages yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {organizerRows.map((message) => {
              const author = message.profiles as unknown as {
                full_name: string;
                role: string;
              } | null;
              const organizer = message.organizers as unknown as {
                title: string;
                client_id: string;
                clients: { primary_contact_name: string } | null;
              } | null;

              return (
                <Link
                  key={message.id}
                  href={`/dashboard/organizers/${message.organizer_id}`}
                  className="block px-5 py-4 transition hover:bg-slate-50"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {organizer?.clients?.primary_contact_name ?? "Client"}
                        </p>
                        <span className="text-xs text-slate-400">·</span>
                        <p className="text-sm text-slate-500">
                          {organizer?.title ?? "Organizer"}
                        </p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">
                        {message.body}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {author?.full_name ?? "Unknown"} ·{" "}
                        {new Date(message.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-blue-600">
                      Open organizer →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
