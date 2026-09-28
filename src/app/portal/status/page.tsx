import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ReturnStatusRow = {
  id: string;
  tax_year: number;
  return_type: string;
  client_stage: string;
  due_date: string | null;
  extension_status: string;
  efile_status: string;
  efile_transmitted_at: string | null;
  efile_accepted_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

const stageOrder = [
  "preparing",
  "review",
  "ready_to_file",
  "filed",
  "accepted",
  "completed",
] as const;

function stageInfo(stage: string) {
  const map: Record<string, { label: string; description: string; classes: string }> = {
    action_needed: {
      label: "Action needed",
      description: "Your tax professional is waiting for information or documents from you.",
      classes: "bg-amber-50 text-amber-800 border-amber-200",
    },
    preparing: {
      label: "In preparation",
      description: "Your tax professional is preparing your return.",
      classes: "bg-blue-50 text-blue-800 border-blue-200",
    },
    review: {
      label: "In review",
      description: "Your return is undergoing internal review.",
      classes: "bg-violet-50 text-violet-800 border-violet-200",
    },
    signature_needed: {
      label: "Signature needed",
      description: "Your return is waiting for a signature or approval step.",
      classes: "bg-amber-50 text-amber-800 border-amber-200",
    },
    ready_to_file: {
      label: "Ready to file",
      description: "Review is complete and the return is ready for filing.",
      classes: "bg-cyan-50 text-cyan-800 border-cyan-200",
    },
    filed: {
      label: "Filed",
      description: "Your return has been transmitted for e-filing.",
      classes: "bg-indigo-50 text-indigo-800 border-indigo-200",
    },
    accepted: {
      label: "Accepted",
      description: "The filing has been accepted.",
      classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
    filing_issue: {
      label: "Filing update",
      description: "Your tax professional is reviewing a filing issue. No action is required unless they contact you.",
      classes: "bg-red-50 text-red-800 border-red-200",
    },
    extended: {
      label: "Extension filed",
      description: "An extension is on file while your return remains in process.",
      classes: "bg-orange-50 text-orange-800 border-orange-200",
    },
    completed: {
      label: "Completed",
      description: "Your return workflow is complete.",
      classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
  };
  return map[stage] ?? {
    label: "In progress",
    description: "Your tax return is in progress.",
    classes: "bg-slate-50 text-slate-700 border-slate-200",
  };
}

function progressFor(stage: string) {
  if (stage === "action_needed") return 15;
  if (stage === "signature_needed") return 60;
  if (stage === "filing_issue") return 78;
  if (stage === "extended") return 45;
  const index = stageOrder.indexOf(stage as (typeof stageOrder)[number]);
  return index < 0 ? 20 : Math.round(((index + 1) / stageOrder.length) * 100);
}

export default async function ClientStatusPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_return_status");
  const rows = (data ?? []) as ReturnStatusRow[];

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="text-sm font-semibold text-blue-600">Tax return progress</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Return status
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Follow the major stages of your return without exposing internal firm notes,
          reviewer assignments, or preparation details.
        </p>
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Return status could not be loaded.
        </p>
      )}

      {!error && rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No active return status yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Your tax professional will make return progress available here once work begins.
          </p>
          <Link
            href="/portal"
            className="mt-5 inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to portal
          </Link>
        </section>
      ) : (
        <div className="grid gap-5">
          {rows.map((row) => {
            const info = stageInfo(row.client_stage);
            const progress = progressFor(row.client_stage);

            return (
              <section
                key={row.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {row.tax_year} {row.return_type}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated {new Date(row.updated_at).toLocaleString()}
                      {row.due_date
                        ? ` · Target date ${new Date(row.due_date + "T00:00:00").toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${info.classes}`}>
                    {info.label}
                  </span>
                </div>

                <div className="px-5 py-5">
                  <p className="text-sm leading-6 text-slate-600">{info.description}</p>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Extension</p>
                      <p className="mt-1 font-semibold capitalize text-slate-900">
                        {row.extension_status.replaceAll("_", " ")}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">E-file</p>
                      <p className="mt-1 font-semibold capitalize text-slate-900">
                        {row.efile_status.replaceAll("_", " ")}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Accepted</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {row.efile_accepted_at
                          ? new Date(row.efile_accepted_at).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
