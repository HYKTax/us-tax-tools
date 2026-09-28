import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ActionItem = {
  key: string;
  title: string;
  description: string;
  href: string;
  label: string;
  urgency: "normal" | "due" | "overdue";
  date: string | null;
};

function urgencyClasses(urgency: ActionItem["urgency"]) {
  if (urgency === "overdue") return "bg-red-50 text-red-700";
  if (urgency === "due") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

export default async function ClientActionsPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client" || !profile.is_active) notFound();

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!client) notFound();

  const [
    { data: organizers },
    { data: requests },
    { data: engagements },
  ] = await Promise.all([
    supabase
      .from("organizers")
      .select("id,title,tax_year,status,sent_at")
      .eq("client_id", client.id)
      .in("status", ["sent", "in_progress"])
      .order("sent_at", { ascending: true }),
    supabase
      .from("document_requests")
      .select("id,title,description,due_date,status,created_at")
      .eq("client_id", client.id)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("client_engagements")
      .select("id,title,sent_at,status")
      .eq("client_id", client.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: true }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const dueSoonDate = new Date();
  dueSoonDate.setUTCDate(dueSoonDate.getUTCDate() + 7);
  const dueSoon = dueSoonDate.toISOString().slice(0, 10);

  const items: ActionItem[] = [
    ...(organizers ?? []).map((item) => ({
      key: "organizer-" + item.id,
      title: item.title,
      description:
        item.status === "in_progress"
          ? "Continue your tax organizer and finish any remaining required questions or uploads."
          : "Your tax firm has sent a tax organizer for tax year " + item.tax_year + ".",
      href: "/portal/organizers/" + item.id,
      label: item.status === "in_progress" ? "Continue organizer" : "Start organizer",
      urgency: "normal" as const,
      date: item.sent_at,
    })),
    ...(requests ?? []).map((item) => {
      const urgency =
        item.due_date && item.due_date < today
          ? ("overdue" as const)
          : item.due_date && item.due_date <= dueSoon
            ? ("due" as const)
            : ("normal" as const);

      return {
        key: "request-" + item.id,
        title: item.title,
        description:
          item.description?.trim() ||
          "Your tax professional requested a supporting document.",
        href: "/portal/documents",
        label: "Upload document",
        urgency,
        date: item.due_date || item.created_at,
      };
    }),
    ...(engagements ?? []).map((item) => ({
      key: "engagement-" + item.id,
      title: item.title,
      description:
        "Review the engagement terms and record your portal acknowledgment.",
      href: "/portal/engagements",
      label: "Review engagement",
      urgency: "due" as const,
      date: item.sent_at,
    })),
  ].sort((left, right) => {
    const rank = { overdue: 0, due: 1, normal: 2 };
    const rankDiff = rank[left.urgency] - rank[right.urgency];
    if (rankDiff !== 0) return rankDiff;
    return (left.date ?? "").localeCompare(right.date ?? "");
  });

  const overdue = items.filter((item) => item.urgency === "overdue").length;
  const due = items.filter((item) => item.urgency === "due").length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">What needs your attention</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Action Center
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          One place for organizer work, requested documents, and engagement acknowledgments.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Open items</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Overdue</p>
          <p className="mt-2 text-3xl font-semibold text-red-950">{overdue}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Priority items</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{due}</p>
        </div>
      </section>

      {items.length === 0 ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-14 text-center">
          <h2 className="font-semibold text-emerald-950">You&apos;re all caught up</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-emerald-800">
            There are no organizer questions, document requests, or engagement acknowledgments waiting for you right now.
          </p>
          <Link
            href="/portal"
            className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm"
          >
            Back to portal home
          </Link>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="block px-5 py-5 transition hover:bg-slate-50"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <span
                      className={
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                        urgencyClasses(item.urgency)
                      }
                    >
                      {item.urgency === "overdue"
                        ? "Overdue"
                        : item.urgency === "due"
                          ? "Action needed"
                          : "Open"}
                    </span>
                    <h2 className="mt-3 font-semibold text-slate-950">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {item.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-blue-600">
                    {item.label} →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
