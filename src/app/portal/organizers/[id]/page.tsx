import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { withSignedUrls } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/message-thread";
import type { PostedMessage } from "@/lib/actions/messages";
import { OrganizerForm, type ItemWithResponse } from "./organizer-form";

function statusClasses(status: string) {
  if (status === "reviewed") return "bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "bg-blue-50 text-blue-700";
  if (status === "sent" || status === "in_progress") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, title, tax_year, status, firm_id, client_id, submitted_at, change_request_reason")
    .eq("id", id)
    .single();

  if (!organizer || !profile) notFound();

  const { data: items } = await supabase
    .from("organizer_items")
    .select("id, sort_order, section_title, prompt, help_text, response_type, options, is_required")
    .eq("organizer_id", id)
    .order("sort_order");

  const itemIds = (items ?? []).map((item) => item.id);

  const [{ data: responses }, { data: rawDocuments }, { data: rawMessages }] = await Promise.all([
    supabase
      .from("organizer_responses")
      .select("organizer_item_id, value")
      .in("organizer_item_id", itemIds),
    supabase
      .from("documents")
      .select("id, organizer_item_id, file_name, storage_path, created_at")
      .eq("organizer_id", id),
    supabase
      .from("organizer_messages")
      .select("id, author_id, body, created_at, profiles(full_name, role)")
      .eq("organizer_id", id)
      .order("created_at"),
  ]);

  const responseByItem = new Map((responses ?? []).map((r) => [r.organizer_item_id, r.value]));
  const documentsWithUrls = await withSignedUrls(supabase, rawDocuments ?? []);
  const documentsByItem = new Map<string, typeof documentsWithUrls>();
  for (const doc of documentsWithUrls) {
    const key = doc.organizer_item_id ?? "";
    documentsByItem.set(key, [...(documentsByItem.get(key) ?? []), doc]);
  }

  const itemsWithData: ItemWithResponse[] = (items ?? []).map((item) => ({
    ...item,
    value: responseByItem.get(item.id) ?? null,
    documents: documentsByItem.get(item.id) ?? [],
  }));

  const initialMessages: PostedMessage[] = (rawMessages ?? []).map((m) => {
    const author = m.profiles as unknown as { full_name: string; role: string } | null;
    return {
      id: m.id,
      author_id: m.author_id,
      body: m.body,
      created_at: m.created_at,
      author_name: author?.full_name ?? "Unknown",
      author_role: author?.role ?? "",
    };
  });

  const readOnly = organizer.status === "submitted" || organizer.status === "reviewed";

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link href="/portal" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to portal</Link>
        <div className="mt-4">
          <p className="text-sm font-semibold text-blue-600">Tax organizer</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{organizer.title}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(organizer.status)}`}>
              {organizer.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-2 text-slate-500">Tax year {organizer.tax_year}</p>
        </div>
      </section>

      {!readOnly && organizer.change_request_reason && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Your tax professional requested changes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{organizer.change_request_reason}</p>
          <p className="mt-2 text-sm text-amber-800">Update the requested answers below, then submit the organizer again.</p>
        </section>
      )}

      {readOnly && (
        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="font-semibold text-slate-950">Organizer submitted</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            This organizer was submitted
            {organizer.submitted_at ? ` on ${new Date(organizer.submitted_at).toLocaleDateString()}` : ""}.
            {" "}Your answers are read-only while your tax professional reviews them.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <OrganizerForm
          organizerId={organizer.id}
          firmId={organizer.firm_id}
          clientId={organizer.client_id}
          items={itemsWithData}
          readOnly={readOnly}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold text-slate-950">Questions or updates?</h2>
        <p className="mt-1 text-sm text-slate-500">Message your tax professional without leaving this organizer.</p>
        <div className="mt-5">
          <MessageThread
            organizerId={organizer.id}
            initialMessages={initialMessages}
            currentProfileId={profile.id}
          />
        </div>
      </section>
    </div>
  );
}
