"use client";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction } from "./actions";
import { buttonClass, inputClass } from "@/components/ui";
import type { ActionResult } from "@/components/forms";

export interface LoginFormStrings {
  email: string;
  password: string;
  submit: string;
  submitting: string;
}

export function LoginForm({ t }: { t: LoginFormStrings }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(loginAction, { ok: true });
  const fe = !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="mt-7 space-y-5" noValidate>
      {!state.ok && (
        <div role="alert" className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">{t.email}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={`${inputClass} !h-10`}
          aria-invalid={!!fe.email}
          aria-describedby={fe.email ? "email-error" : undefined}
        />
        {fe.email && <p id="email-error" className="mt-1.5 text-[13px] text-red-700">{fe.email}</p>}
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-slate-700">{t.password}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`${inputClass} !h-10`}
          aria-invalid={!!fe.password}
          aria-describedby={fe.password ? "password-error" : undefined}
        />
        {fe.password && <p id="password-error" className="mt-1.5 text-[13px] text-red-700">{fe.password}</p>}
      </div>
      <button type="submit" disabled={pending} className={`${buttonClass("primary")} !h-10 w-full`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
