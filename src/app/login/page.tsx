"use client";

import { useActionState } from "react";
import { Brand } from "@/components/brand";
import { signIn, type SignInState } from "./actions";
import { useEmailCooldown } from "@/lib/use-email-cooldown";

const initialState: SignInState = { status: "idle" };

export default function LoginPage() {
  const { seconds, startCooldown } = useEmailCooldown();
  const [state, formAction, pending] = useActionState(async (previous: SignInState, formData: FormData) => {
    const result = await signIn(previous, formData);
    startCooldown(result.cooldownSeconds ?? 0);
    return result;
  }, initialState);

  return (
    <main className="min-h-screen bg-slate-950 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden min-h-screen flex-col justify-between p-10 text-white lg:flex xl:p-14">
        <Brand inverse />
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
            Secure tax collaboration
          </p>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
            One secure workspace for your tax firm and clients.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Collect organizers, documents, client responses, and messages without chasing information across email.
          </p>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {["Passwordless access", "Private documents", "Firm-managed workflow"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Built for CPA firms, EAs, tax preparers, and accounting professionals.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
            <p className="text-sm font-semibold text-blue-600">Client & staff portal</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Sign in securely</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Enter your email and we&apos;ll send you a secure sign-in link. No password to remember.
            </p>

            <div className="mt-8">
              {state.status === "sent" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
                  {state.message}
                </div>
              ) : (
                <form action={formAction} onSubmit={(event) => {
                  if (pending || seconds > 0) event.preventDefault();
                }} className="flex flex-col gap-4">
                  <label className="text-sm font-medium text-slate-700">
                    Email address
                    <input
                      type="email"
                      name="email"
                      required
                      autoComplete="email"
                      placeholder="you@firm.com"
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={pending || seconds > 0}
                    className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "Sending secure link…" : seconds > 0 ? `Retry in ${seconds}s` : "Send secure sign-in link"}
                  </button>
                  {state.status === "error" && (
                    <p role="alert" className="text-sm text-red-600">{state.message}</p>
                  )}
                </form>
              )}
            </div>

            <div className="mt-7 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
              Only users invited by a participating tax firm can access this portal.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
