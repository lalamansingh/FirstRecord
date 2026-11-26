"use client";
/** Evaluation credentials with copy buttons and a one-click "fill the form" action. */
import { useState } from "react";
import { Check, Copy, LogIn } from "lucide-react";

export interface ReviewPanelStrings {
  title: string;
  id: string;
  password: string;
  update: string;
  copy: string;
  copied: string;
  useDemo: string;
}

function fill(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function CopyButton({ value, label, copied }: { value: string; label: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable (e.g. insecure context) — value stays selectable */
        }
      }}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[#e6e4de] bg-white px-2.5 text-[12px] font-medium text-[#3a3d44] transition-colors hover:border-[#d7d2cc] hover:bg-[#f5f3f1]"
      aria-label={`${label}: ${value}`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-[#19c37d]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite">{done ? copied : label}</span>
    </button>
  );
}

export function ReviewPanel({ email, password, t }: { email: string; password: string; t: ReviewPanelStrings }) {
  const [filled, setFilled] = useState(false);
  return (
    <section aria-labelledby="review-title" className="mt-4 overflow-hidden rounded-[14px] border border-[#e6e4de] bg-white text-[13px] leading-relaxed text-[#4e545a]">
      <div className="flex items-center justify-between gap-3 border-b border-[#ebe9e3] bg-[#e7f6e9] px-4 py-2.5">
        <h2 id="review-title" className="flex items-center gap-2 text-[13px] font-semibold text-[#111216]">
          <span className="h-2 w-2 rounded-full bg-[#19c37d]" aria-hidden />
          {t.title}
        </h2>
      </div>
      <dl className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <dt className="text-[12px] text-[#5b5e66]">{t.id}</dt>
            <dd className="truncate font-mono text-[13px] text-[#111216] select-all">{email}</dd>
          </div>
          <CopyButton value={email} label={t.copy} copied={t.copied} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <dt className="text-[12px] text-[#5b5e66]">{t.password}</dt>
            <dd className="truncate font-mono text-[13px] text-[#111216] select-all">{password}</dd>
          </div>
          <CopyButton value={password} label={t.copy} copied={t.copied} />
        </div>
      </dl>
      <div className="flex flex-col gap-3 border-t border-[#ebe9e3] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-[#111216]">{t.update}</p>
        <button
          type="button"
          onClick={() => {
            fill("email", email);
            fill("password", password);
            setFilled(true);
            document.getElementById("password")?.focus();
          }}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#111216] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#2a2c33]"
        >
          {filled ? <Check className="h-3.5 w-3.5" aria-hidden /> : <LogIn className="h-3.5 w-3.5" aria-hidden />}
          {t.useDemo}
        </button>
      </div>
    </section>
  );
}
