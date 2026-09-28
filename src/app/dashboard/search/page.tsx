import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const supabase = await createClient();

  if (query.length < 2) {
    return (
      <div className="flex flex-col gap-7">
        <section>
          <p className="text-sm font-semibold text-blue-600">Firm workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Global search
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Find clients, returns, organizers, documents, and internal tasks from one place.
          </p>
        </section>

        <form action="/dashboard/search" method="get" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-slate-700">
            Search the firm workspace
            <div className="mt-2 flex gap-2">
              <input
                name="q"
                placeholder="Client, email, document, organizer, task…"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                Search
              </button>
            </div>
          </label>
          <p className="mt-2 text-xs text-slate-500">Enter at least 2 characters.</p>
        </form>
      </div>
    );
  }

  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

  const [
    { data: clients },
    { data: documents },
    { data: organizers },
    { data: tasks },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id,primary_contact_name,email,client_type,status")
      .or(`primary_contact_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("primary_contact_name")
      .limit(20),
    supabase
      .from("documents")
      .select("id,client_id,file_name,status,created_at,clients(primary_contact_name)")
      .ilike("file_name", pattern)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("organizers")
      .select("id,client_id,title,tax_year,status,clients(primary_contact_name)")
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("staff_tasks")
      .select("id,client_id,tax_return_job_id,title,status,priority,due_date,clients(primary_contact_name)")
      .or(`title.ilike.${pattern},details.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const matchedClientIds = Array.from(
    new Set([
      ...(clients ?? []).map((client) => client.id),
      ...(documents ?? []).map((document) => document.client_id),
      ...(organizers ?? []).map((organizer) => organizer.client_id),
      ...(tasks ?? []).flatMap((task) => (task.client_id ? [task.client_id] : [])),
    ])
  );

  let returns: Array<{
    id: string;
    client_id: string;
    tax_year: number;
    return_type: string;
    status: string;
    due_date: string | null;
    clients: { primary_contact_name: string } | null;
  }> = [];

  if (/^\d{4}$/.test(query)) {
    const { data } = await supabase
      .from("tax_return_jobs")
      .select("id,client_id,tax_year,return_type,status,due_date,clients(primary_contact_name)")
      .eq("tax_year", Number(query))
      .order("updated_at", { ascending: false })
      .limit(20);
    returns = (data ?? []) as unknown as typeof returns;
  } else if (matchedClientIds.length > 0) {
    const { data } = await supabase
      .from("tax_return_jobs")
      .select("id,client_id,tax_year,return_type,status,due_date,clients(primary_contact_name)")
      .in("client_id", matchedClientIds.slice(0, 100))
      .order("updated_at", { ascending: false })
      .limit(20);
    returns = (data ?? []) as unknown as typeof returns;
  }

  const total =
    (clients?.length ?? 0) +
    (documents?.length ?? 0) +
    (organizers?.length ?? 0) +
    (tasks?.length ?? 0) +
    returns.length;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Firm workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Global search
        </h1>
        <p className="mt-2 text-slate-500">
          {total} result{total === 1 ? "" : "s"} for “{query}”
        </p>
      </section>

      <form action="/dashboard/search" method="get" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Search
          </button>
        </div>
      </form>

      {total === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No matching records</h2>
          <p className="mt-2 text-sm text-slate-500">
            Try a client name, email, document filename, organizer title, task text, or tax year.
          </p>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {(clients?.length ?? 0) > 0 && (
            <ResultSection title="Clients" count={clients!.length}>
              {clients!.map((client) => (
                <Link key={client.id} href={`/dashboard/clients/${client.id}`} className="block px-5 py-4 hover:bg-slate-50">
                  <p className="font-semibold text-slate-900">{client.primary_contact_name}</p>
                  <p className="mt-1 text-sm text-slate-500">{client.email} · {client.client_type}</p>
                </Link>
              ))}
            </ResultSection>
          )}

          {returns.length > 0 && (
            <ResultSection title="Tax returns" count={returns.length}>
              {returns.map((item) => (
                <Link key={item.id} href={`/dashboard/work/${item.id}`} className="block px-5 py-4 hover:bg-slate-50">
                  <p className="font-semibold text-slate-900">
                    {item.clients?.primary_contact_name ?? "Client"} · {item.tax_year} {item.return_type}
                  </p>
                  <p className="mt-1 text-sm capitalize text-slate-500">{item.status.replaceAll("_", " ")}</p>
                </Link>
              ))}
            </ResultSection>
          )}

          {(documents?.length ?? 0) > 0 && (
            <ResultSection title="Documents" count={documents!.length}>
              {documents!.map((document) => {
                const client = document.clients as unknown as { primary_contact_name: string } | null;
                return (
                  <Link key={document.id} href={`/dashboard/documents/${document.id}`} className="block px-5 py-4 hover:bg-slate-50">
                    <p className="truncate font-semibold text-slate-900">{document.file_name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {client?.primary_contact_name ?? "Client"} · {new Date(document.created_at).toLocaleDateString()}
                    </p>
                  </Link>
                );
              })}
            </ResultSection>
          )}

          {(organizers?.length ?? 0) > 0 && (
            <ResultSection title="Organizers" count={organizers!.length}>
              {organizers!.map((organizer) => {
                const client = organizer.clients as unknown as { primary_contact_name: string } | null;
                return (
                  <Link key={organizer.id} href={`/dashboard/organizers/${organizer.id}`} className="block px-5 py-4 hover:bg-slate-50">
                    <p className="font-semibold text-slate-900">{organizer.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {client?.primary_contact_name ?? "Client"} · {organizer.tax_year} · {organizer.status.replaceAll("_", " ")}
                    </p>
                  </Link>
                );
              })}
            </ResultSection>
          )}

          {(tasks?.length ?? 0) > 0 && (
            <ResultSection title="Internal tasks" count={tasks!.length}>
              {tasks!.map((task) => {
                const client = task.clients as unknown as { primary_contact_name: string } | null;
                return (
                  <Link key={task.id} href="/dashboard/tasks" className="block px-5 py-4 hover:bg-slate-50">
                    <p className="font-semibold text-slate-900">{task.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {client?.primary_contact_name ?? "No client"} · {task.status.replaceAll("_", " ")} · {task.priority}
                    </p>
                  </Link>
                );
              })}
            </ResultSection>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{count} result{count === 1 ? "" : "s"}</p>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}
