import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { hasStaffPermission } from "@/lib/staff-permissions";
import { DuplicateTemplateButton } from "./duplicate-template-button";

export default async function TemplatesPage() {
  const profile = await getCurrentProfile();
  const canManageTemplates = Boolean(profile && hasStaffPermission(profile, "templates.manage"));
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("organizer_templates")
    .select("id, name, tax_year, organizer_template_items(count)")
    .order("tax_year", { ascending: false })
    .order("name");

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Organizer library</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Organizer templates</h1>
          <p className="mt-2 text-slate-500">Create reusable questionnaires and document requests for each return type.</p>
        </div>
        {canManageTemplates && (
          <Link
            href="/dashboard/templates/new"
            className="inline-flex w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + New template
          </Link>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load templates: {error.message}
        </p>
      )}

      {!error && (!templates || templates.length === 0) && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-900">No organizer templates yet</h2>
          <p className="mt-2 text-sm text-slate-500">Create a reusable 1040, business, or custom organizer to start collecting client information.</p>
          {canManageTemplates ? (
            <Link href="/dashboard/templates/new" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              Create template
            </Link>
          ) : (
            <p className="mt-4 text-xs text-slate-400">Manager or Firm Admin access is required to create templates.</p>
          )}
        </div>
      )}

      {templates && templates.length > 0 && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-950">{template.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">Tax year {template.tax_year}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {template.organizer_template_items[0]?.count ?? 0} questions
                </span>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-500">
                Ready to send from any client profile. Questions are copied into each client organizer when sent.
              </p>
              {canManageTemplates && (
                <DuplicateTemplateButton
                  templateId={template.id}
                  sourceYear={template.tax_year}
                />
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
