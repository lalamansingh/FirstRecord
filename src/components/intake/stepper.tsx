import { getTr } from "@/lib/i18n/server";
import Link from "next/link";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";
import { STEP_LABELS, type Step } from "@/lib/domain/statements";
import type { MsgKey } from "@/lib/i18n/messages";

/** Accessible progress indicator for the report workflow. */
export async function Stepper({
  statementId,
  steps,
  active,
  completion,
  reachable,
}: {
  statementId: string;
  steps: Step[];
  active: Step;
  completion: Record<Step, boolean>;
  reachable: (s: Step) => boolean;
}) {
  const tr = await getTr();
  const idx = steps.indexOf(active);
  return (
    <nav aria-label={tr("Report progress")} className="mb-6">
      <p className="sr-only">
        {tr("Step {n} of {total}", { n: idx + 1, total: steps.length })}: {tr(STEP_LABELS[active] as MsgKey)}
      </p>
      <ol className="flex flex-wrap gap-y-2">
        {steps.map((s, i) => {
          const done = completion[s];
          const isActive = s === active;
          const can = reachable(s);
          const body = (
            <>
              <span
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1",
                  isActive ? "bg-navy-700 text-white ring-navy-700" : done ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-500 ring-slate-300",
                )}
                aria-hidden
              >
                {done && !isActive ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cx("text-xs font-medium", isActive ? "text-navy-800" : done ? "text-slate-800" : "text-slate-500")}>
                {tr(STEP_LABELS[s] as MsgKey)}
                {done && <span className="sr-only"> (complete)</span>}
              </span>
            </>
          );
          return (
            <li key={s} className="flex items-center">
              {can && !isActive ? (
                <Link href={`/intake/${statementId}?step=${s}`} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-slate-100">
                  {body}
                </Link>
              ) : (
                <span aria-current={isActive ? "step" : undefined} className="flex items-center gap-1.5 px-1.5 py-1">
                  {body}
                </span>
              )}
              {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-slate-300 sm:w-6" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
