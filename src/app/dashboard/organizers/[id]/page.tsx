import { RequestChanges } from "./request-changes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { withSignedUrls } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/message-thread";
import type { PostedMessage } from "@/lib/actions/messages";
import { MarkReviewedButton } from "./mark-reviewed-button";
import { hasStaffPermission } from "@/lib/staff-permissions";

function statusClasses(status: string) {
  if (status === "reviewed") return "bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "bg-blue-50 text-blue-700";
  if (status === "sent" || status === "in_progress") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default async function StaffOrganizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, title, tax_year, status, submitted_at, client_id, change_request_reason, clients!organizers_client_firm_fk(primary_contact_name)")
    .eq("id", id)
    .maybeSingle();

  if (organizerError) {
    console.error("[staff/organizer] Lookup failed", { code: organizerError.code });
    throw new Error("Unable to load this organizer. Please try again.");
  }

  if (!organizer || !profile) notFound();
  const canReviewOrganizer = hasStaffPermission(profile, "organizers.review");

  const { data: items } = await supabase
    .from("organizer_items")
    .select("id, sort_order, section_title, prompt, help_text, response_type")
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
      .select("id, organizer_item_id, file_name, storage_path")
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

  const clientName =
    (organizer.clients as unknown as { primary_contact_name: string } | null)
      ?.primary_contact_name ?? "Client";

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link
          href={`/dashboard/clients/${organizer.client_id}`}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← {clientName}
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold text-blue-600">Organizer review</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{organizer.title}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(organizer.status)}`}>
                {organizer.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-2 text-slate-500">
              {clientName} · Tax year {organizer.tax_year}
              {organizer.submitted_at ? ` · Submitted ${new Date(organizer.submitted_at).toLocaleDateString()}` : ""}
            </p>
          </div>

          {organizer.status === "submitted" && canReviewOrganizer && (
            <div>
              <MarkReviewedButton organizerId={organizer.id} />
            </div>
          )}
        </div>
      </section>

      {(organizer.status === "submitted" || organizer.status === "reviewed") && canReviewOrganizer && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Review actions</h2>
          <p className="mt-1 text-sm text-slate-500">Approve the organizer or ask the client to correct specific information.</p>
          <div className="mt-4">
            <RequestChanges organizerId={id} />
          </div>
        </section>
      )}

      {(organizer.status === "submitted" || organizer.status === "reviewed") && !canReviewOrganizer && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-800">Read-only review view</p>
          <p className="mt-1 text-sm text-slate-500">
            A Reviewer, Manager, or Firm Admin must approve this organizer or request corrections.
          </p>
        </section>
      )}

      {organizer.change_request_reason && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Last correction request</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900/80">{organizer.change_request_reason}</p>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Client responses</h2>
          <p className="mt-1 text-sm text-slate-500">Review answers and uploaded files submitted through this organizer.</p>
        </div>

        <div className="divide-y divide-slate-100">
          {(items ?? []).map((item) => {
            const docs = documentsByItem.get(item.id) ?? [];
            return (
              <div key={item.id} className="px-5 py-5">
                {item.section_title && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{item.section_title}</p>
                )}
                <p className="text-sm font-semibold text-slate-900">{item.prompt}</p>
                {item.help_text && <p className="mt-1 text-xs leading-5 text-slate-500">{item.help_text}</p>}

                <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
                  {item.response_type === "file" ? (
                    docs.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {docs.map((doc) => (
                          <li key={doc.id} className="text-sm">
                            {doc.url ? (
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-blue-600 hover:text-blue-700"
                              >
                                {doc.file_name} ↗
                              </a>
                            ) : (
                              <span className="text-slate-700">{doc.file_name}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">No file uploaded</p>
                    )
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-slate-700">
                      {String(responseByItem.get(item.id) ?? "No response")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Messages</h2>
        <p className="mt-1 text-sm text-slate-500">Keep questions and follow-up communication attached to this organizer.</p>
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
