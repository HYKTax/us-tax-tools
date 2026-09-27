import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesPage() {
  const supabase = await createClient();

  const { data: messages, error } = await supabase
    .from("organizer_messages")
    .select("id, organizer_id, body, created_at, profiles(full_name, role), organizers(title, client_id, clients!organizers_client_firm_fk(primary_contact_name))")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Communication</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Messages</h1>
        <p className="mt-2 text-slate-500">See recent organizer conversations across all clients.</p>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load messages: {error.message}
        </p>
      )}

      {!error && (!messages || messages.length === 0) ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No messages yet</h2>
          <p className="mt-2 text-sm text-slate-500">Messages sent inside organizers will appear here.</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Recent conversations</h2>
            <p className="mt-1 text-sm text-slate-500">Open the related organizer to reply in context.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {(messages ?? []).map((message) => {
              const author = message.profiles as unknown as { full_name: string; role: string } | null;
              const organizer = message.organizers as unknown as {
                title: string;
                client_id: string;
                clients: { primary_contact_name: string } | null;
              } | null;
              return (
                <Link key={message.id} href={`/dashboard/organizers/${message.organizer_id}`} className="block px-5 py-4 transition hover:bg-slate-50">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{organizer?.clients?.primary_contact_name ?? "Client"}</p>
                        <span className="text-xs text-slate-400">·</span>
                        <p className="text-sm text-slate-500">{organizer?.title ?? "Organizer"}</p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">{message.body}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {author?.full_name ?? "Unknown"} · {new Date(message.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-blue-600">Open conversation →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
