"use client";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const tr = useT();
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-red-200 bg-white p-6 text-center">
      <h1 className="text-base font-semibold text-slate-900">{tr("Something went wrong loading this page")}</h1>
      <p className="mt-1 text-sm text-slate-600">{tr("No changes were made. Try again, or go back to the overview.")}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button className={buttonClass("primary")} onClick={reset}>{tr("Try again")}</button>
        <Link className={buttonClass("secondary")} href="/">{tr("Overview")}</Link>
      </div>
    </div>
  );
}
