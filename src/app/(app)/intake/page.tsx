import type { MsgKey } from "@/lib/i18n/messages";
import { trDyn } from "@/lib/i18n/dynamic";
import { getTr, getLang } from "@/lib/i18n/server";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can, maskPii } from "@/lib/rbac/access";
import { listIntakes, STEP_LABELS } from "@/lib/domain/statements";
import { CAPTURE_METHOD_LABELS, formatDate, formatRelative } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "New Report") };
}

const VIEWS = { in_progress: "In progress", completed: "Completed", abandoned: "Abandoned" } as const;

export default async function IntakeListPage({ searchParams }: { searchParams: Promise<{ view?: string; mine?: string }> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requirePagePermission("statement.create", "statement.view");
  const sp = await searchParams;
  const view = (sp.view && sp.view in VIEWS ? sp.view : "in_progress") as keyof typeof VIEWS;
  const mineOnly = sp.mine === "1";
  const rows = listIntakes(user, { status: view, mineOnly });
  const canStart = can(user, "statement.create");
  const stationScope = can(user, "case.view.station") || can(user, "case.view.all");

  return (
    <>
      <PageHeader
        title={tr("New Report")}
        description={tr("Record a person's account, prepare a draft for review, and create a case. Reports can be saved and resumed at any step.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("New Report") }]}
        actions={canStart ? <ButtonLink href="/intake/new" variant="primary"><FilePlus2 className="h-4 w-4" aria-hidden /> {tr("Start new report")}</ButtonLink> : undefined}
      />
      <Tabs
        active={view}
        tabs={Object.entries(VIEWS).map(([k, label]) => ({ key: k, label: tr(label), href: `/intake?view=${k}${mineOnly ? "&mine=1" : ""}` }))}
      />
      {stationScope && (
        <div className="mb-3 flex gap-3 text-sm">
          <Link href={`/intake?view=${view}`} aria-current={!mineOnly ? "true" : undefined} className={!mineOnly ? "font-semibold text-slate-900" : "text-[#1B6650] hover:underline"}>{tr("Station")}</Link>
          <Link href={`/intake?view=${view}&mine=1`} aria-current={mineOnly ? "true" : undefined} className={mineOnly ? "font-semibold text-slate-900" : "text-[#1B6650] hover:underline"}>{tr("Started by me")}</Link>
        </div>
      )}
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={view === "in_progress" ? "No reports in progress" : view === "completed" ? "No completed reports yet" : "No abandoned reports"}
              description={view === "in_progress" ? "Start a new report to record someone's account. Progress is saved after each step." : undefined}
              action={canStart && view === "in_progress" ? <ButtonLink href="/intake/new" variant="primary">{tr("Start new report")}</ButtonLink> : undefined}
            />
          </div>
        ) : (
          <Table caption={tr("Report intakes")}>
            <thead>
              <tr>
                <Th>{tr("Started")}</Th>
                <Th>{tr("Speaker")}</Th>
                <Th>{tr("Incident type")}</Th>
                <Th>{tr("Method")}</Th>
                <Th>{view === "completed" ? tr("Case") : "Current step"}</Th>
                <Th>{tr("Started by")}</Th>
                <Th>{tr("Updated")}</Th>
                <Th><span className="sr-only">{tr("Actions")}</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{formatDate(r.intake_at, { time: true, lang })}<span className="block text-xs text-slate-500">{r.station_code}</span></Td>
                  <Td>{maskPii(user, r.speaker_name) || <span className="text-slate-400">{tr("Not recorded")}</span>}</Td>
                  <Td>{r.incident_type ?? <span className="text-slate-400">{tr("Not yet known")}</span>}</Td>
                  <Td>{r.capture_method ? trDyn(tr, CAPTURE_METHOD_LABELS[r.capture_method]) : <span className="text-slate-400">{tr("Not chosen")}</span>}</Td>
                  <Td>{view === "completed" ? (r.case_reference && r.case_id ? <Link className="font-medium text-[#1B6650] hover:underline" href={`/cases/${r.case_id}`}>{r.case_reference}</Link> : "—") : <Badge tone="blue">{tr(STEP_LABELS[r.current_step] as MsgKey)}</Badge>}</Td>
                  <Td>{r.creator_name}</Td>
                  <Td>{formatRelative(r.updated_at, lang)}</Td>
                  <Td className="text-right">
                    {view === "in_progress" ? (
                      <ButtonLink size="sm" href={`/intake/${r.id}?step=${r.current_step}`}>{tr("Resume")}</ButtonLink>
                    ) : (
                      <ButtonLink size="sm" href={`/statements/${r.id}`}>{tr("Open record")}</ButtonLink>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
