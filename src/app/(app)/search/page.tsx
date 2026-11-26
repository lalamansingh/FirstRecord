import { getTr, getLang } from "@/lib/i18n/server";
import Link from "next/link";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { all } from "@/lib/db";
import { can, caseVisibilityFilter, taskVisibilityFilter } from "@/lib/rbac/access";
import { getWorkflow, stateOf } from "@/lib/domain/workflow";
import { Badge, Card, EmptyState, PageHeader, inputClass, buttonClass } from "@/components/ui";
import { PriorityBadge } from "@/components/i18n/localized";
import { formatDate } from "@/lib/format";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Search") };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const sp = await searchParams;
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim().slice(0, 100);
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const cwf = localizeWorkflow(getWorkflow("case"), tr);
  const twf = localizeWorkflow(getWorkflow("task"), tr);

  const caseScope = can(user, "case.view.assigned") || can(user, "case.view.station") || can(user, "case.view.all");
  const cases =
    q.length >= 2 && caseScope
      ? (() => {
          const f = caseVisibilityFilter(user);
          return all<{ id: string; reference: string; title: string; incident_type: string; status: string; priority: string; received_at: string }>(
            `SELECT c.id, c.reference, c.title, c.incident_type, c.status, c.priority, c.received_at FROM cases c
              WHERE ${f.sql} AND (c.reference LIKE ? OR c.title LIKE ?)
              ORDER BY CASE WHEN c.reference LIKE ? THEN 0 ELSE 1 END, c.updated_at DESC LIMIT 25`,
            ...f.params, like, like, `${q.replace(/[%_]/g, "")}%`,
          );
        })()
      : [];
  const tasks =
    q.length >= 2 && can(user, "task.view")
      ? (() => {
          const f = taskVisibilityFilter(user);
          return all<{ id: string; title: string; status: string; priority: string; due_at: string | null; case_reference: string | null }>(
            `SELECT t.id, t.title, t.status, t.priority, t.due_at, c.reference AS case_reference FROM tasks t
               LEFT JOIN cases c ON c.id = t.case_id
              WHERE ${f.sql} AND (t.title LIKE ? OR c.reference LIKE ?)
              ORDER BY t.updated_at DESC LIMIT 25`,
            ...f.params, like, like,
          );
        })()
      : [];

  return (
    <>
      <PageHeader title={tr("Search")} crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Search") }]} description={tr("Searches case references, case titles and task titles you have access to. Statement content is never searched here.")} />
      <form method="get" action="/search" role="search" className="mb-6 flex max-w-xl gap-2">
        <label htmlFor="search-q" className="sr-only">{tr("Search term")}</label>
        <input id="search-q" name="q" type="search" defaultValue={q} minLength={2} maxLength={100} placeholder={tr("Case reference, case title or task")} className={inputClass} autoFocus />
        <button type="submit" className={buttonClass("primary")}><Search className="h-4 w-4" aria-hidden /> {tr("Search")}</button>
      </form>
      {q.length < 2 ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title={tr("Enter at least 2 characters")} description={tr("Try a case reference such as CNT/2026, or words from a case or task title.")} />
      ) : cases.length === 0 && tasks.length === 0 ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title={tr("No results for “{q}”", { q })} description={tr("Check the spelling or try a shorter reference. Only records you have access to are shown.")} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title={tr("Cases ({n})", { n: cases.length })} padded={false}>
            {cases.length === 0 ? <p className="p-4 text-sm text-slate-500">{tr("No matching cases.")}</p> : (
              <ul className="divide-y divide-slate-100">
                {cases.map((c) => {
                  const st = stateOf(cwf, c.status);
                  return (
                    <li key={c.id} className="px-4 py-3 hover:bg-slate-50">
                      <Link href={`/cases/${c.id}`} className="block">
                        <span className="font-mono text-xs font-semibold text-[#1B6650]">{c.reference}</span>
                        <span className="ml-2 text-sm font-medium text-slate-900">{c.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <Badge tone={st.color}>{st.label}</Badge><PriorityBadge priority={c.priority} />{c.incident_type ? trDyn(tr, c.incident_type) : ""} · {tr("received {date}", { date: formatDate(c.received_at, { lang }) })}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title={tr("Tasks ({n})", { n: tasks.length })} padded={false}>
            {tasks.length === 0 ? <p className="p-4 text-sm text-slate-500">{tr("No matching tasks.")}</p> : (
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => {
                  const st = stateOf(twf, t.status);
                  return (
                    <li key={t.id} className="px-4 py-3 hover:bg-slate-50">
                      <Link href={`/tasks/${t.id}`} className="block">
                        <span className="text-sm font-medium text-slate-900">{t.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <Badge tone={st.color}>{st.label}</Badge><PriorityBadge priority={t.priority} />
                          {t.case_reference && <span className="font-mono">{t.case_reference}</span>}
                          {t.due_at && <span>{tr("due {date}", { date: formatDate(t.due_at, { lang }) })}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
