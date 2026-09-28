import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClientEngagementCard } from "./client-engagement-card";

export default async function ClientEngagementsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client" || !profile.is_active) notFound();

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!client) notFound();

  const { data: engagements, error } = await supabase
    .from("client_engagements")
    .select("id,title,body,status,sent_at,acknowledged_name,acknowledged_at")
    .eq("client_id", client.id)
    .order("sent_at", { ascending: false });

  const pending = (engagements ?? []).filter((item) => item.status === "sent");
  const completed = (engagements ?? []).filter(
    (item) => item.status === "acknowledged"
  );

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Client onboarding</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Engagements
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Review engagement letters and consent text sent by your tax firm, then record your portal acknowledgment when requested.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Action needed</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{pending.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Acknowledged</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">{completed.length}</p>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Engagements could not be loaded.
        </p>
      )}

      {!error && !(engagements ?? []).length ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No engagements yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Engagements sent by your tax firm will appear here.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-5">
          {pending.map((item) => (
            <ClientEngagementCard
              key={item.id}
              id={item.id}
              title={item.title}
              body={item.body}
              status={item.status}
              sentAt={item.sent_at}
              acknowledgedName={item.acknowledged_name}
              acknowledgedAt={item.acknowledged_at}
            />
          ))}
          {completed.map((item) => (
            <ClientEngagementCard
              key={item.id}
              id={item.id}
              title={item.title}
              body={item.body}
              status={item.status}
              sentAt={item.sent_at}
              acknowledgedName={item.acknowledged_name}
              acknowledgedAt={item.acknowledged_at}
            />
          ))}
        </div>
      )}
    </div>
  );
}
