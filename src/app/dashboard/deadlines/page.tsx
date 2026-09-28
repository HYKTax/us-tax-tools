import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type DeadlineRow = {
  id: string;
  client_id: string;
  tax_year: number;
  return_type: string;
  status: string;
  priority: string;
  due_date: string;
  clients: { primary_contact_name: string } | null;
  preparer: { full_name: string } | null;
  reviewer: { full_name: string } | null;
};

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  return new Date(key + "-01T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawYear = Array.isArray(params.year) ? params.year[0] : params.year;
  const selectedYear = rawYear ? Number(rawYear) : 0;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tax_return_jobs")
    .select(
      "id,client_id,tax_year,return_type,status,priority,due_date,clients(primary_contact_name),preparer:profiles!tax_return_jobs_preparer_id_fkey(full_name),reviewer:profiles!tax_return_jobs_reviewer_id_fkey(full_name)"
    )
    .not("due_date", "is", null)
    .not("status", "in", '("accepted","completed")')
    .order("due_date", { ascending: true })
    .limit(1000);

  const allRows = ((data ?? []) as unknown as DeadlineRow[]).filter(
    (row) => Boolean(row.due_date)
  );
  const years = Array.from(new Set(allRows.map((row) => row.tax_year))).sort(
    (a, b) => b - a
  );
  const rows = selectedYear
    ? allRows.filter((row) => row.tax_year === selectedYear)
    : allRows;

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date();
  in30.setUTCDate(in30.getUTCDate() + 30);
  const in30Date = in30.toISOString().slice(0, 10);

  const overdue = rows.filter((row) => row.due_date < today).length;
  const next30 = rows.filter(
    (row) => row.due_date >= today && row.due_date <= in30Date
  ).length;
  const urgent = rows.filter((row) => row.priority === "urgent").length;

  const grouped = new Map<string, DeadlineRow[]>();
  for (const row of rows) {
    const key = monthKey(row.due_date);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Firm calendar</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Deadlines
          </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Open tax returns with target due dates, grouped chronologically for workload planning.
          </p>
        </div>
        <Link
          href="/dashboard/deadlines/export"
          className="w-fit rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export calendar (.ics)
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Overdue</p>
          <p className="mt-2 text-3xl font-semibold text-red-950">{overdue}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">Next 30 days</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{next30}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Urgent priority</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{urgent}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form action="/dashboard/deadlines" method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Tax year
            <select
              name="year"
              defaultValue={selectedYear || ""}
              className="mt-2 block rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
            >
              <option value="">All years</option>
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply
          </button>
          {selectedYear > 0 && (
            <Link
              href="/dashboard/deadlines"
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              Clear
            </Link>
          )}
        </form>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Deadlines could not be loaded.
        </p>
      )}

      {!error && rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No open deadlines</h2>
          <p className="mt-2 text-sm text-slate-500">
            Add due dates to return jobs and they will appear here.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([month, monthRows]) => (
            <section
              key={month}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
                <h2 className="font-semibold text-slate-950">{monthLabel(month)}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {monthRows.length} open deadline{monthRows.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {monthRows.map((row) => {
                  const overdueRow = row.due_date < today;
                  return (
                    <Link
                      key={row.id}
                      href={`/dashboard/work/${row.id}`}
                      className="flex flex-col justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 lg:flex-row lg:items-center"
                    >
                      <div className="flex min-w-0 items-start gap-4">
                        <div className={
                          "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center " +
                          (overdueRow
                            ? "border-red-200 bg-red-50 text-red-800"
                            : "border-slate-200 bg-white text-slate-800")
                        }>
                          <span className="text-[10px] font-semibold uppercase">
                            {new Date(row.due_date + "T00:00:00").toLocaleDateString(undefined, { month: "short" })}
                          </span>
                          <span className="text-lg font-semibold leading-5">
                            {new Date(row.due_date + "T00:00:00").getDate()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-slate-950">
                              {row.clients?.primary_contact_name ?? "Client"}
                            </p>
                            {overdueRow && (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                Overdue
                              </span>
                            )}
                            {row.priority === "urgent" && (
                              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                                Urgent
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {row.tax_year} {row.return_type} · {statusLabel(row.status)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-sm text-slate-500 lg:text-right">
                        <p>Preparer: {row.preparer?.full_name ?? "Unassigned"}</p>
                        <p className="mt-1">Reviewer: {row.reviewer?.full_name ?? "Unassigned"}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
