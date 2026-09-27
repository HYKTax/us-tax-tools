"use client";

import { useState, useTransition } from "react";
import { createTaxReturnJob } from "@/app/dashboard/work/actions";

type StaffOption = { id: string; full_name: string };
type OrganizerOption = { id: string; title: string; tax_year: number; status: string };

export function CreateReturnJobForm({
  clientId,
  preparers,
  reviewers,
  organizers,
}: {
  clientId: string;
  preparers: StaffOption[];
  reviewers: StaffOption[];
  organizers: OrganizerOption[];
}) {
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(currentYear);
  const [returnType, setReturnType] = useState("1040");
  const [organizerId, setOrganizerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [preparerId, setPreparerId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const fieldClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await createTaxReturnJob({
            clientId,
            organizerId: organizerId || undefined,
            taxYear,
            returnType,
            dueDate: dueDate || undefined,
            preparerId: preparerId || undefined,
            reviewerId: reviewerId || undefined,
          });
          if (result.error) {
            setMessage(result.error);
          } else {
            setMessage("Tax return added to the work queue.");
          }
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Return type
          <select value={returnType} onChange={(event) => setReturnType(event.target.value)} className={fieldClass}>
            <option value="1040">1040 Individual</option>
            <option value="1040-NR">1040-NR</option>
            <option value="1065">1065 Partnership</option>
            <option value="1120-S">1120-S S Corporation</option>
            <option value="1120">1120 C Corporation</option>
            <option value="1041">1041 Estate / Trust</option>
            <option value="990">990 Exempt Organization</option>
            <option value="706">706 Estate Tax</option>
            <option value="709">709 Gift Tax</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Tax year
          <input type="number" value={taxYear} onChange={(event) => setTaxYear(Number(event.target.value))} className={fieldClass} />
        </label>
      </div>

      <label className="text-sm font-medium text-slate-700">
        Link organizer
        <select value={organizerId} onChange={(event) => setOrganizerId(event.target.value)} className={fieldClass}>
          <option value="">No organizer linked</option>
          {organizers.map((organizer) => (
            <option key={organizer.id} value={organizer.id}>
              {organizer.tax_year} · {organizer.title} · {organizer.status.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Preparer
          <select value={preparerId} onChange={(event) => setPreparerId(event.target.value)} className={fieldClass}>
            <option value="">Unassigned</option>
            {preparers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Reviewer
          <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className={fieldClass}>
            <option value="">Unassigned</option>
            {reviewers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </label>
      </div>

      <label className="text-sm font-medium text-slate-700">
        Due date
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={fieldClass} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Creating return…" : "Create tax return"}
      </button>

      {message && <p className="text-sm text-slate-500">{message}</p>}
    </form>
  );
}
