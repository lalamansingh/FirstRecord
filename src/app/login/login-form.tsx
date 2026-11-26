"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginAction } from "./actions";
import { buttonClass, inputClass } from "@/components/ui";
import type { ActionResult } from "@/components/forms";

export interface LoginFormStrings {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  showPassword?: string;
  hidePassword?: string;
}

export function LoginForm({ t }: { t: LoginFormStrings }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(loginAction, { ok: true });
  const fe = !state.ok ? state.fieldErrors ?? {} : {};
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-7 space-y-5" noValidate>
      {!state.ok && (
        <div role="alert" className="rounded-[12px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[#111216]">{t.email}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={`${inputClass} !h-11`}
          aria-invalid={!!fe.email}
          aria-describedby={fe.email ? "email-error" : undefined}
        />
        {fe.email && <p id="email-error" className="mt-1.5 text-[13px] text-red-700">{fe.email}</p>}
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[#111216]">{t.password}</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${inputClass} !h-11 pr-11`}
            aria-invalid={!!fe.password}
            aria-describedby={fe.password ? "password-error" : undefined}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#5b5e66] transition-colors hover:bg-[#f5f3f1] hover:text-[#111216]"
            aria-label={show ? t.hidePassword ?? "Hide password" : t.showPassword ?? "Show password"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        {fe.password && <p id="password-error" className="mt-1.5 text-[13px] text-red-700">{fe.password}</p>}
      </div>
      <button type="submit" disabled={pending} className={`${buttonClass("primary")} !h-11 w-full`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
