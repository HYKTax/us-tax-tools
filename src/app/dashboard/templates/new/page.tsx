"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createTemplate, type TemplateItemInput } from "../actions";

const emptyItem: TemplateItemInput = {
  prompt: "",
  help_text: "",
  section_title: "",
  response_type: "text",
  is_required: true,
  choices: [],
};

export default function NewTemplatePage() {
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState("");
  const [taxYear, setTaxYear] = useState(currentYear);
  const [items, setItems] = useState<TemplateItemInput[]>([{ ...emptyItem }]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<TemplateItemInput>) {
    setItems((previous) => previous.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updateChoice(itemIndex: number, choiceIndex: number, value: string) {
    setItems((previous) =>
      previous.map((item, i) => {
        if (i !== itemIndex) return item;
        const choices = [...(item.choices ?? [])];
        choices[choiceIndex] = value;
        return { ...item, choices };
      })
    );
  }

  function addChoice(itemIndex: number) {
    setItems((previous) =>
      previous.map((item, i) =>
        i === itemIndex ? { ...item, choices: [...(item.choices ?? []), ""] } : item
      )
    );
  }

  function removeChoice(itemIndex: number, choiceIndex: number) {
    setItems((previous) =>
      previous.map((item, i) =>
        i === itemIndex
          ? { ...item, choices: (item.choices ?? []).filter((_, ci) => ci !== choiceIndex) }
          : item
      )
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTemplate({ name, taxYear, items });
      if (result?.error) setError(result.error);
    });
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/templates" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Organizer templates</Link>

      <section className="mt-4">
        <p className="text-sm font-semibold text-blue-600">Template builder</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Create organizer template</h1>
        <p className="mt-2 text-slate-500">Build a reusable questionnaire with sections, help text, choices, and document upload requests.</p>
      </section>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-950">Template details</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_180px]">
            <label className="text-sm font-medium text-slate-700">
              Template name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="1040 Individual Tax Organizer"
                required
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tax year
              <input
                type="number"
                value={taxYear}
                onChange={(event) => setTaxYear(Number(event.target.value))}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-950">Questions</h2>
              <p className="mt-1 text-sm text-slate-500">{items.length} question{items.length === 1 ? "" : "s"} in this template</p>
            </div>
            <button
              type="button"
              onClick={() => setItems((previous) => [...previous, { ...emptyItem }])}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              + Add question
            </button>
          </div>

          {items.map((item, index) => (
            <article key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Question {index + 1}</p>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((previous) => previous.filter((_, i) => i !== index))}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_190px]">
                <label className="text-sm font-medium text-slate-700">
                  Question
                  <input
                    type="text"
                    value={item.prompt}
                    onChange={(event) => updateItem(index, { prompt: event.target.value })}
                    placeholder="Did you receive wages during the year?"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Answer type
                  <select
                    value={item.response_type}
                    onChange={(event) =>
                      updateItem(index, {
                        response_type: event.target.value as TemplateItemInput["response_type"],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Yes / No</option>
                    <option value="select">Multiple choice</option>
                    <option value="file">File upload</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Section
                  <input
                    type="text"
                    value={item.section_title ?? ""}
                    onChange={(event) => updateItem(index, { section_title: event.target.value })}
                    placeholder="Income"
                    className={inputClass}
                  />
                  <span className="mt-1.5 block text-xs font-normal text-slate-500">Use the same section name on consecutive questions to group them.</span>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Help text
                  <input
                    type="text"
                    value={item.help_text}
                    onChange={(event) => updateItem(index, { help_text: event.target.value })}
                    placeholder="Example: Upload all W-2 forms received."
                    className={inputClass}
                  />
                </label>
              </div>

              {item.response_type === "select" && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Answer choices</p>
                    <button type="button" onClick={() => addChoice(index)} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                      + Add choice
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    {(item.choices ?? []).map((choice, choiceIndex) => (
                      <div key={choiceIndex} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={choice}
                          onChange={(event) => updateChoice(index, choiceIndex, event.target.value)}
                          placeholder={`Choice ${choiceIndex + 1}`}
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeChoice(index, choiceIndex)}
                          className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-500 hover:bg-white hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  {(item.choices ?? []).filter((choice) => choice.trim()).length === 0 && (
                    <p className="mt-3 text-xs text-amber-700">Add at least one choice for a dropdown question.</p>
                  )}
                </div>
              )}

              <label className="mt-4 flex w-fit items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={item.is_required}
                  onChange={(event) => updateItem(index, { is_required: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Required before submission
              </label>
            </article>
          ))}
        </section>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <div className="sticky bottom-4 flex justify-end">
          <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <Link href="/dashboard/templates" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {pending ? "Saving template…" : "Save template"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
