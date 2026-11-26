/**
 * "Suggested legal provisions" panel for a statement. Server component.
 * Suggestions only: the officer decides which provisions apply.
 */
import Link from "next/link";
import { Check, FilePlus2, RotateCcw, Scale, Search, X } from "lucide-react";
import { can, type AuthUser } from "@/lib/rbac/access";
import { getLang, getTr } from "@/lib/i18n/server";
import { listDraftsForStatement } from "@/lib/domain/drafts";
import { listProvisions, listSuggestions, type SuggestionRow } from "@/lib/domain/legal";
import { provisionTitleHi } from "@/lib/seed/legal";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, inputClass, Notice } from "@/components/ui";
import type { Tr } from "@/lib/i18n/messages";
import {
  addProvisionAction,
  applyToDraftAction,
  decideSuggestionAction,
  generateSuggestionsAction,
} from "@/app/(app)/legal/actions";

function DecisionButton({ s, decision, label, icon, variant = "secondary" }: { s: SuggestionRow; decision: "selected" | "rejected" | "suggested"; label: string; icon: React.ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <ActionForm action={decideSuggestionAction}>
      <input type="hidden" name="suggestionId" value={s.id} />
      <input type="hidden" name="statementId" value={s.statement_id} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton variant={variant} size="sm">
        {icon} {label}
        <span className="sr-only"> {s.code}</span>
      </SubmitButton>
    </ActionForm>
  );
}

function SuggestionItem({ s, tr, lang, canSelect }: { s: SuggestionRow; tr: Tr; lang: string; canSelect: boolean }) {
  const title = (lang === "hi" ? provisionTitleHi(s.code) : undefined) ?? s.title;
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-navy-950/5 px-2 py-0.5 font-mono text-[13px] font-semibold text-navy-950">{s.code}</span>
            <span className="font-medium text-slate-900">{title}</span>
            {s.status === "selected" && <Badge tone="green">{tr("Selected by officer")}</Badge>}
            {s.status === "rejected" && <Badge tone="slate">{tr("Rejected")}</Badge>}
            {s.status === "suggested" && <Badge tone="amber">{tr("Awaiting officer decision")}</Badge>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{s.act}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{s.summary}</p>
        </div>
        {canSelect && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {s.status !== "selected" && <DecisionButton s={s} decision="selected" label={tr("Select")} icon={<Check className="h-3.5 w-3.5" aria-hidden />} variant="primary" />}
            {s.status === "suggested" && <DecisionButton s={s} decision="rejected" label={tr("Reject")} icon={<X className="h-3.5 w-3.5" aria-hidden />} />}
            {s.status !== "suggested" && s.origin !== "officer" && <DecisionButton s={s} decision="suggested" label={tr("Undo")} icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />} variant="ghost" />}
            {s.status === "selected" && s.origin === "officer" && <DecisionButton s={s} decision="rejected" label={tr("Remove")} icon={<X className="h-3.5 w-3.5" aria-hidden />} variant="ghost" />}
          </div>
        )}
      </div>

      {s.origin === "officer" ? (
        <p className="mt-3 text-xs text-slate-500">{tr("Added by an officer from the catalogue (not suggested by the system).")}</p>
      ) : s.reasons.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500">{tr("Why this was suggested — exact words from the statement")}</p>
          <ul className="mt-1.5 space-y-1.5">
            {s.reasons.map((r, i) => (
              <li key={i} className="border-l-2 border-slate-300 bg-slate-50 py-1.5 pl-3 pr-2 text-sm text-slate-800">
                <q>{r.quote}</q>
                <span className="ml-2 whitespace-nowrap text-xs text-slate-500">{tr("Matched phrase: {phrase}", { phrase: r.keyword })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {s.decided_at && s.decided_by_name && (
        <p className="mt-2 text-xs text-slate-500">{tr("Decided by {name} on {date}", { name: s.decided_by_name, date: formatDate(s.decided_at, { time: true, lang }) })}</p>
      )}
    </li>
  );
}

export async function LegalPanel({ user, statementId }: { user: AuthUser; statementId: string }) {
  if (!can(user, "legal.suggest")) return null;
  const tr = await getTr();
  const lang = await getLang();
  const suggestions = listSuggestions(user, statementId);
  const canSelect = can(user, "legal.select");
  const selected = suggestions.filter((s) => s.status === "selected");
  const pending = suggestions.filter((s) => s.status === "suggested");
  const rejected = suggestions.filter((s) => s.status === "rejected");
  const draft = listDraftsForStatement(statementId)[0];
  const usedIds = new Set(selected.map((s) => s.provision_id));
  const catalog = canSelect ? listProvisions({ activeOnly: true }).filter((p) => !usedIds.has(p.id)) : [];

  return (
    <Card
      title={tr("Suggested legal provisions")}
      icon={<Scale className="h-4 w-4" aria-hidden />}
      description={tr("Sections from the catalogue whose key phrases appear in the statement. Each suggestion quotes the exact words that triggered it.")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {can(user, "legal.manage") && (
            <Link href="/legal" className="text-sm font-medium text-[#111216] hover:underline">{tr("Manage catalogue")}</Link>
          )}
          <ActionForm action={generateSuggestionsAction}>
            <input type="hidden" name="statementId" value={statementId} />
            <SubmitButton size="sm" variant="secondary" pendingLabel={tr("Reading statement…")}>
              <Search className="h-3.5 w-3.5" aria-hidden /> {suggestions.length ? tr("Refresh suggestions") : tr("Find suggestions")}
            </SubmitButton>
          </ActionForm>
        </div>
      }
    >
      <Notice tone="amber" title={tr("Suggestions only — the officer decides which provisions apply.")} className="mb-4">
        {tr("This is not legal advice and does not determine guilt. Only provisions an officer selects are added to the FIR draft. The catalogue is a starter list and must be verified against the official text before use.")}
      </Notice>

      {suggestions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          {tr("No suggestions yet. Use “Find suggestions” to check the statement against the catalogue.")}
        </p>
      ) : (
        <div className="space-y-6">
          {selected.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{tr("Selected by officer ({count})", { count: selected.length })}</h3>
              <ul className="space-y-3">{selected.map((s) => <SuggestionItem key={s.id} s={s} tr={tr} lang={lang} canSelect={canSelect} />)}</ul>
            </section>
          )}
          {pending.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{tr("Awaiting decision ({count})", { count: pending.length })}</h3>
              <ul className="space-y-3">{pending.map((s) => <SuggestionItem key={s.id} s={s} tr={tr} lang={lang} canSelect={canSelect} />)}</ul>
            </section>
          )}
          {rejected.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">{tr("Rejected ({count})", { count: rejected.length })}</summary>
              <ul className="mt-2 space-y-3">{rejected.map((s) => <SuggestionItem key={s.id} s={s} tr={tr} lang={lang} canSelect={canSelect} />)}</ul>
            </details>
          )}
        </div>
      )}

      {canSelect && (
        <div className="mt-6 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-2">
          <ActionForm action={addProvisionAction} className="space-y-2">
            <input type="hidden" name="statementId" value={statementId} />
            <label htmlFor={`add-prov-${statementId}`} className="block text-sm font-medium text-slate-800">{tr("Add a provision from the catalogue")}</label>
            <div className="flex gap-2">
              <select id={`add-prov-${statementId}`} name="provisionId" required className={inputClass} defaultValue="">
                <option value="" disabled>{tr("Choose a provision…")}</option>
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {(lang === "hi" ? provisionTitleHi(p.code) : undefined) ?? p.title}</option>
                ))}
              </select>
              <SubmitButton size="sm" variant="secondary">{tr("Add")}</SubmitButton>
            </div>
          </ActionForm>
          {draft && can(user, "draft.edit") && (
            <ActionForm
              action={applyToDraftAction}
              className="space-y-2"
              confirmTitle={tr("Add selected provisions to the FIR draft?")}
              confirmLabel={tr("Update draft")}
              confirm={tr("The draft's “Legal provisions” field will be replaced with the {count} selected provision(s) and saved as a new draft version.", { count: selected.length })}
            >
              <input type="hidden" name="statementId" value={statementId} />
              <p className="text-sm font-medium text-slate-800">{tr("FIR draft")}</p>
              <p className="text-xs text-slate-500">{tr("Only officer-selected provisions are written into the draft.")}</p>
              <SubmitButton size="sm" variant="primary" disabled={selected.length === 0}>
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden /> {tr("Add selected to FIR draft")}
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </Card>
  );
}

/** Compact list of officer-selected provisions across a case's statements. */
export async function CaseProvisionsSummary({ items }: { items: { code: string; title: string; act: string; statement_id: string }[] }) {
  if (items.length === 0) return null;
  const tr = await getTr();
  const lang = await getLang();
  return (
    <Card title={tr("Legal provisions selected by officers")} icon={<Scale className="h-4 w-4" aria-hidden />}>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={`${p.statement_id}-${p.code}`} className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="font-mono font-semibold text-navy-950">{p.code}</span>
            <span className="text-slate-800">{(lang === "hi" ? provisionTitleHi(p.code) : undefined) ?? p.title}</span>
            <Link href={`/statements/${p.statement_id}`} className="text-xs text-[#111216] hover:underline">{tr("Statement")}</Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">{tr("Selected by officers from suggestions. Not a legal determination.")}</p>
    </Card>
  );
}
