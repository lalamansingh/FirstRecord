import { getTr, getLang } from "@/lib/i18n/server";
import { localizeAuditSummary } from "@/lib/i18n/audit-summary";
import Link from "next/link";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Info, Paperclip, Plus, Lock } from "lucide-react";
import { requireUser, requestIp } from "@/lib/auth/session";
import { can, canViewCase, maskPii, type AuthUser } from "@/lib/rbac/access";
import {
  assignableStaff,
  caseAccessList,
  caseCounts,
  caseNotes,
  caseStatements,
  caseTasks,
  caseTimeline,
  dismissedDuplicateIds,
  getCase,
  listLinks,
  listParties,
  logCaseView,
  logPartyPiiView,
  recentAccessEvents,
  reviewerStaff,
  statusHistory,
  type CaseDetail,
} from "@/lib/domain/cases";
import { findPossibleDuplicates, formatDuplicateReason } from "@/lib/domain/duplicates";
import { attachmentDownloadUrl, listCaseAttachments } from "@/lib/domain/attachments";
import { getSetting, getWorkflow, stateLabel, stateOf, type Workflow } from "@/lib/domain/workflow";
import { config } from "@/lib/config";
import { ALLOWED_ATTACHMENT_TYPES } from "@/lib/storage";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  KeyValue,
  Notice,
  PageHeader,
  
  Table,
  Tabs,
  Td,
  Th,
  cx,
} from "@/components/ui";
import { PriorityBadge } from "@/components/i18n/localized";
import { CaseStatusBadge, OfficialStatusBadge } from "@/components/cases/status-badge";
import { Disclosure } from "@/components/cases/disclosure";
import {
  AssignForm,
  AttachmentUploader,
  CaseStatusForm,
  DeleteAttachmentForm,
  DetailsForm,
  DuplicateSuggestionActions,
  EditPartyButton,
  LinkForm,
  NoteForm,
  OfficialStatusForm,
  PartyForm,
  RequestReviewForm,
  UnlinkButton,
} from "@/components/cases/case-forms";
import {
  CAPTURE_METHOD_LABELS,
  DRAFT_STATUS_LABELS,
  OFFICIAL_STATUS_LABELS,
  PARTY_ROLE_LABELS,
  formatBytes,
  formatDate,
  formatRelative,
  isOverdue,
} from "@/lib/format";
import { LANGUAGES } from "@/lib/domain/workflow";
import { selectedProvisionsForCase } from "@/lib/domain/legal";
import { CaseProvisionsSummary } from "@/components/legal/legal-panel";

type SP = Record<string, string | string[] | undefined>;
const TABS = ["overview", "statements", "tasks", "timeline", "records", "access"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id) || !canViewCase(user, id)) return { title: "Case" };
  return { title: getCase(user, id).reference };
}

export default async function CaseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || !canViewCase(user, id)) notFound();
  const c = getCase(user, id);
  const ip = await requestIp();
  logCaseView(user, id, ip);

  const rawTab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) as Tab | undefined;
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : "overview";
  const wf = localizeWorkflow(getWorkflow("case"), tr);
  const counts = caseCounts(id);
  const canStatements = can(user, "statement.view");
  const canAudit = can(user, "audit.view");

  const tabs = [
    { key: "overview", label: tr("Overview"), href: `/cases/${id}` },
    ...(canStatements ? [{ key: "statements", label: tr("Statement & drafts"), href: `/cases/${id}?tab=statements`, count: counts.statements }] : []),
    { key: "tasks", label: tr("Tasks"), href: `/cases/${id}?tab=tasks`, count: counts.open_tasks },
    { key: "timeline", label: tr("Timeline"), href: `/cases/${id}?tab=timeline` },
    { key: "records", label: tr("Records"), href: `/cases/${id}?tab=records`, count: counts.attachments },
    { key: "access", label: tr("Access"), href: `/cases/${id}?tab=access` },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Cases"), href: "/cases" }, { label: c.reference }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-semibold text-slate-500">{c.reference}</span>
            <span>{c.title}</span>
          </span>
        }
        meta={
          <>
            <CaseStatusBadge wf={wf} status={c.status} />
            <PriorityBadge priority={c.priority} />
            <OfficialStatusBadge status={c.official_status} />
            
            <span className="text-xs text-slate-500">
              {c.station_name} · {tr("Assigned to {name}", { name: c.assignee_name ?? tr("nobody") })} · {tr("Received {date}", { date: formatDate(c.received_at, { lang }) })} · {tr("Updated {time}", { time: formatRelative(c.updated_at, lang) })}
            </span>
          </>
        }
        actions={
          can(user, "task.manage") ? (
            <ButtonLink href={`/tasks/new?caseId=${id}`} size="sm">
              <Plus className="h-4 w-4" aria-hidden /> {tr("Create task")}
            </ButtonLink>
          ) : undefined
        }
      />
      <Tabs tabs={tabs} active={tab} />

      {tab === "overview" && <OverviewTab user={user} c={c} wf={wf} ip={ip} />}
      {tab === "statements" && canStatements && <StatementsTab user={user} c={c} />}
      {tab === "statements" && !canStatements && <Notice tone="slate">{tr("Your role does not include access to statement content.")}</Notice>}
      {tab === "tasks" && <TasksTab user={user} c={c} />}
      {tab === "timeline" && <TimelineTab user={user} c={c} wf={wf} />}
      {tab === "records" && <RecordsTab user={user} c={c} />}
      {tab === "access" && <AccessTab user={user} c={c} canAudit={canAudit} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

async function OfficialStatusBox({ c, user }: { c: CaseDetail; user: AuthUser }) {
  const tr = await getTr();
  const lang = await getLang();
  const info = OFFICIAL_STATUS_LABELS[c.official_status] ?? OFFICIAL_STATUS_LABELS.local;
  const tone = c.official_status === "filed" ? "green" : c.official_status === "submitted" ? "amber" : "slate";
  const Icon = c.official_status === "filed" ? CheckCircle2 : c.official_status === "submitted" ? AlertTriangle : Info;
  return (
    <div
      className={cx(
        "rounded-lg border p-4",
        tone === "green" && "border-emerald-300 bg-emerald-50",
        tone === "amber" && "border-amber-300 bg-amber-50",
        tone === "slate" && "border-slate-300 bg-slate-50",
      )}
      aria-labelledby="official-status-heading"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="official-status-heading" className="text-sm font-semibold text-slate-900">{tr("Official status:")} {trDyn(tr, info.label)}</h2>
          <p className="mt-0.5 text-sm text-slate-700">{trDyn(tr, info.description)}</p>
          {c.official_status !== "local" && (
            <p className="mt-1 text-xs text-slate-600">
              {tr("System:")} {c.official_system ?? "—"} · {tr("Reference:")} {c.official_reference ?? "—"}
              {c.official_confirmed_at ? ` · ${tr("Recorded {date}", { date: formatDate(c.official_confirmed_at, { time: true, lang }) })}` : ""} · {tr("Entered manually (no automatic integration configured)")}
            </p>
          )}
          {can(user, "case.official_status") && (
            <Disclosure label={tr("Update official status")} size="sm" className="mt-3">
              <Notice tone="amber" className="mb-3">
                {tr("Record \"submitted\" or \"filed\" only from a verified response by an authorized external system. Saving or reviewing a draft in FirstRecord is never an official filing.")}
              </Notice>
              <OfficialStatusForm caseId={c.id} current={{ status: c.official_status, system: c.official_system, reference: c.official_reference }} />
            </Disclosure>
          )}
        </div>
      </div>
    </div>
  );
}

async function OverviewTab({ user, c, wf, ip }: { user: AuthUser; c: CaseDetail; wf: Workflow; ip: string | null }) {
  const tr = await getTr();
  const lang = await getLang();
  const parties = listParties(user, c.id);
  const canPii = can(user, "party.view_pii");
  if (parties.some((p) => p.phone || p.address)) logPartyPiiView(user, c.id, ip);
  const links = listLinks(user, c.id);
  const linkedIds = new Set(links.map((l) => l.other_id));
  const dismissed = dismissedDuplicateIds(c.id);
  const suggestions = can(user, "case.link")
    ? findPossibleDuplicates(user, {
        stationId: c.station_id,
        incidentType: c.incident_type,
        incidentDate: c.incident_date,
        names: parties.map((p) => p.name),
        phones: parties.map((p) => p.phone).filter(Boolean) as string[],
        excludeCaseId: c.id,
      }).filter((s) => !linkedIds.has(s.id) && !dismissed.has(s.id))
    : [];
  const notes = caseNotes(user, c.id);
  const transitions = (wf.transitions[c.status] ?? []).map((k) => stateOf(wf, k)).map((s) => ({ key: s.key, label: s.label, category: s.category }));
  const staff = can(user, "case.assign") ? assignableStaff(c.station_id) : [];
  const reviewers = can(user, "case.edit") ? reviewerStaff(c.station_id).filter((r) => r.id !== user.id) : [];
  const incidentTypes = getSetting("incident.types");

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <OfficialStatusBox c={c} user={user} />

        <Card
          title={tr("Incident summary")}
          description={tr("Officer-maintained summary. Source statements and transcripts are preserved separately.")}
          actions={
            can(user, "case.edit") ? (
              <Disclosure label={tr("Edit details")} size="sm">
                <div className="absolute left-4 right-4 z-10 mt-1 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_4px_12px_rgb(16_24_40/0.08)] sm:left-auto sm:w-[36rem]">
                  <DetailsForm c={c} incidentTypes={incidentTypes} />
                </div>
              </Disclosure>
            ) : undefined
          }
          className="relative"
        >
          {c.summary ? <p className="whitespace-pre-wrap text-sm text-slate-800">{c.summary}</p> : <p className="text-sm text-slate-500">{tr("No summary written yet.")}</p>}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <KeyValue
              items={[
                { label: tr("Incident type"), value: c.incident_type },
                { label: tr("Incident date/time"), value: formatDate(c.incident_date, { time: true, lang }) },
                { label: tr("Location"), value: c.incident_location },
                { label: tr("Received"), value: formatDate(c.received_at, { time: true, lang }) },
                {
                  label: tr("Next action"),
                  value: c.next_action ? (
                    <span className={cx(isOverdue(c.next_action_due) && "text-red-700")}>
                      {c.next_action}
                      {c.next_action_due ? ` — ${tr("due {date}", { date: formatDate(c.next_action_due, { time: true, lang }) })}${isOverdue(c.next_action_due) ? ` (${tr("overdue")})` : ""}` : ""}
                    </span>
                  ) : null,
                },
                { label: tr("Created by"), value: `${c.creator_name} · ${formatDate(c.created_at, { time: true, lang })}` },
                { label: tr("Closed"), value: c.closed_at ? formatDate(c.closed_at, { time: true, lang }) : tr("Open") },
              ]}
            />
          </div>
        </Card>

        <Card
          title={tr("People")}
          description={canPii ? tr("Contact details are sensitive; viewing them is logged.") : tr("Contact details are restricted for your role.")}
          actions={
            can(user, "case.edit") ? (
              <Disclosure label={tr("Add person")} size="sm">
                <div className="absolute left-4 right-4 z-10 mt-1 sm:left-auto sm:w-[36rem]">
                  <PartyForm caseId={c.id} canPii={canPii} />
                </div>
              </Disclosure>
            ) : undefined
          }
          className="relative"
        >
          {parties.length === 0 ? (
            <p className="text-sm text-slate-500">{tr("No complainant, witness or other party records yet.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {parties.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {p.name} <Badge tone={p.party_role === "complainant" ? "blue" : "slate"}>{trDyn(tr, PARTY_ROLE_LABELS[p.party_role] ?? p.party_role)}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {[p.age && tr("Age {n}", { n: p.age }), p.gender].filter(Boolean).join(" · ") || tr("No age/gender recorded")}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {tr("Phone:")} {maskPii(user, p.phone) || "—"} · {tr("Address:")} {maskPii(user, p.address) || "—"}
                    </p>
                    {p.notes && <p className="mt-1 text-xs text-slate-700">{p.notes}</p>}
                    {p.statement_id && can(user, "statement.view") && (
                      <Link href={`/statements/${p.statement_id}`} className="mt-1 inline-block text-xs text-[#111216] hover:underline">{tr("View linked statement")}</Link>
                    )}
                  </div>
                  {can(user, "case.edit") && <EditPartyButton caseId={c.id} party={p} canPii={canPii} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {can(user, "legal.suggest") && <CaseProvisionsSummary items={selectedProvisionsForCase(c.id)} />}

        <Card title={tr("Related cases")} description={tr("Links are for reference only. FirstRecord never merges records automatically.")} actions={can(user, "case.link") ? <LinkForm caseId={c.id} /> : undefined}>
          {suggestions.length > 0 && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">{tr("Possible duplicates to check")}</p>
              <p className="text-xs text-amber-800">{tr("Suggestions based on matching details. Review each one; nothing is changed unless you act.")}</p>
              <ul className="mt-2 space-y-2">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-3 py-2">
                    <div>
                      <Link href={`/cases/${s.id}`} className="font-mono text-xs font-semibold text-[#111216] hover:underline">{s.reference}</Link>
                      <span className="ml-2 text-sm text-slate-800">{s.title}</span>
                      <p className="text-xs text-slate-500">{s.reasons.map((r) => formatDuplicateReason(trDyn.bind(null, tr), r)).join("; ")}</p>
                    </div>
                    <DuplicateSuggestionActions caseId={c.id} otherCaseId={s.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {links.length === 0 ? (
            <p className="text-sm text-slate-500">{tr("No linked cases.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/cases/${l.other_id}`} className="font-mono text-xs font-semibold text-[#111216] hover:underline">{l.reference}</Link>
                    <span className="ml-2 text-sm text-slate-800">{l.title}</span>
                    <span className="ml-2"><Badge tone={l.link_type === "possible_duplicate" ? "amber" : "slate"}>{l.link_type === "possible_duplicate" ? tr("Possible duplicate") : "Related"}</Badge></span>
                    <span className="ml-2 text-xs text-slate-500">{stateLabel(localizeWorkflow(getWorkflow("case"), tr), l.status)}</span>
                    {l.note && <p className="text-xs text-slate-500">{l.note}</p>}
                  </div>
                  {can(user, "case.link") && <UnlinkButton caseId={c.id} linkId={l.id} reference={l.reference} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={tr("Internal notes")} description={tr("Visible to staff with access to this case. Not part of any statement.")}>
          {can(user, "case.edit") && (
            <div className="mb-4">
              <NoteForm caseId={c.id} />
            </div>
          )}
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">{tr("No notes yet.")}</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{n.author}</span> · <time dateTime={n.created_at}>{formatDate(n.created_at, { time: true, lang })}</time>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <aside className="space-y-5" aria-label={tr("Case actions")}>
        <Card title={tr("Workflow status")} description={tr("Internal stage only — not an official filing status.")}>
          <p className="mb-3 text-sm">
            {tr("Current:")} <CaseStatusBadge wf={wf} status={c.status} />
          </p>
          {can(user, "case.status") ? <CaseStatusForm caseId={c.id} options={transitions} /> : <p className="text-sm text-slate-500">{tr("You cannot change the status of this case.")}</p>}
        </Card>
        <Card title={tr("Assignment")}>
          <p className="mb-3 text-sm text-slate-700">{tr("Lead:")} <span className="font-medium">{c.assignee_name ?? tr("Unassigned")}</span></p>
          {can(user, "case.assign") ? <AssignForm caseId={c.id} current={c.assigned_to} staff={staff} /> : <p className="text-xs text-slate-500">{tr("Assignment is managed by station administrators.")}</p>}
        </Card>
        {can(user, "case.edit") && (
          <Card title={tr("Request review")} description={tr("Ask an authorized officer to review statements and drafts.")}>
            <RequestReviewForm caseId={c.id} reviewers={reviewers} />
          </Card>
        )}
      </aside>
    </div>
  );
}

async function StatementsTab({ user, c }: { user: AuthUser; c: CaseDetail }) {
  const tr = await getTr();
  const lang = await getLang();
  const { statements, drafts } = caseStatements(user, c.id);
  return (
    <div className="space-y-5">
      <Notice tone="blue" title={tr("Drafts are not official documents")}>
        {tr("AI or rule-based assistant drafts must be reviewed by an authorized officer. \"Reviewed\" means an officer checked the draft against the source statement — it does not mean an FIR was filed.")}
      </Notice>
      {statements.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title={tr("No statements linked to this case")} description={tr("Statements are linked when a report intake is completed for this case.")} />
      ) : (
        statements.map((s) => {
          const sd = drafts.filter((d) => d.statement_id === s.id);
          return (
            <Card
              key={s.id}
              title={tr("Statement recorded {date}", { date: formatDate(s.intake_at, { time: true, lang }) })}
              description={`${trDyn(tr, PARTY_ROLE_LABELS[s.speaker_role] ?? s.speaker_role)} · ${s.capture_method ? trDyn(tr, CAPTURE_METHOD_LABELS[s.capture_method]) : tr("Method not set")} · ${trDyn(tr, LANGUAGES[s.language]?.label ?? s.language)} · ${tr("recorded by {name}", { name: s.creator })}`}
              actions={<ButtonLink href={`/statements/${s.id}`} size="sm">{tr("Open statement")} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></ButtonLink>}
            >
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                <Badge tone={s.status === "completed" ? "green" : "amber"}>{s.status === "completed" ? tr("Statement recorded") : s.status === "abandoned" ? tr("Abandoned") : tr("Intake in progress")}</Badge>
                <Badge>{tr("Transcript versions: {n}", { n: s.transcript_versions })}</Badge>
                <Badge>{tr("Recordings: {n}", { n: s.recordings })}</Badge>
                {s.transcript_confirmed_at ? <Badge tone="blue">{tr("Transcript confirmed")} {formatDate(s.transcript_confirmed_at, { lang })}</Badge> : <Badge tone="amber">{tr("Transcript not yet confirmed")}</Badge>}
              </div>
              {sd.length === 0 ? (
                <p className="text-sm text-slate-500">{tr("No FIR draft prepared from this statement.")}</p>
              ) : (
                <Table caption={tr("Drafts")}>
                  <thead>
                    <tr><Th>{tr("Draft")}</Th><Th>{tr("Status")}</Th><Th>{tr("Version")}</Th><Th>{tr("Reviewed")}</Th><Th><span className="sr-only">{tr("Actions")}</span></Th></tr>
                  </thead>
                  <tbody>
                    {sd.map((d) => (
                      <tr key={d.id}>
                        <Td>{d.template_name}</Td>
                        <Td><Badge tone={d.status === "reviewed" ? "green" : d.status === "clarification_requested" ? "amber" : "blue"}>{trDyn(tr, DRAFT_STATUS_LABELS[d.status] ?? d.status)}</Badge></Td>
                        <Td>v{d.current_version}</Td>
                        <Td>{d.reviewed_at ? `${d.reviewer} · ${formatDate(d.reviewed_at, { lang })}` : "—"}</Td>
                        <Td className="text-right">
                          <Link href={`/statements/${s.id}/review?draft=${d.id}`} className="text-sm font-medium text-[#111216] hover:underline">
                            {can(user, "draft.review") && d.status !== "reviewed" ? tr("Review draft") : tr("View draft")}
                          </Link>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

async function TasksTab({ user, c }: { user: AuthUser; c: CaseDetail }) {
  const tr = await getTr();
  const lang = await getLang();
  const tasks = caseTasks(user, c.id);
  const twf = localizeWorkflow(getWorkflow("task"), tr);
  return (
    <Card
      title={tr("Tasks for this case")}
      padded={false}
      actions={can(user, "task.manage") ? <ButtonLink href={`/tasks/new?caseId=${c.id}`} size="sm" variant="primary"><Plus className="h-4 w-4" aria-hidden /> {tr("Create task")}</ButtonLink> : undefined}
    >
      {tasks.length === 0 ? (
        <div className="p-4">
          <EmptyState title={tr("No tasks yet")} description={tr("Create tasks to track follow-up work such as contacting witnesses or collecting documents.")} />
        </div>
      ) : (
        <Table caption={tr("Tasks")}>
          <thead>
            <tr><Th>{tr("Task")}</Th><Th>{tr("Status")}</Th><Th>{tr("Priority")}</Th><Th>{tr("Assignee")}</Th><Th>{tr("Due")}</Th></tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const st = stateOf(twf, t.status);
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td><Link href={`/tasks/${t.id}`} className="font-medium text-slate-900 hover:underline">{t.title}</Link></Td>
                  <Td><Badge tone={st.color}>{st.label}</Badge></Td>
                  <Td><PriorityBadge priority={t.priority} /></Td>
                  <Td>{t.assignee_name ?? <span className="text-slate-400">{tr("Unassigned")}</span>}</Td>
                  <Td className={cx(isOverdue(t.due_at, t.completed_at) && "font-medium text-red-700")}>
                    {t.due_at ? `${formatDate(t.due_at, { time: true, lang })}${isOverdue(t.due_at, t.completed_at) ? ` (${tr("overdue")})` : ""}` : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function TimelineTab({ user, c, wf }: { user: AuthUser; c: CaseDetail; wf: Workflow }) {
  const tr = await getTr();
  const lang = await getLang();
  const entries = caseTimeline(user, c.id);
  const history = statusHistory(user, c.id);
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Card title={tr("Activity history")} description={tr("Chronological record of actions on this case (newest first).")} className="xl:col-span-2">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">{tr("No activity recorded.")}</p>
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {entries.map((e, i) => (
              <li key={i} className="relative">
                <span className={cx("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white", e.kind === "note" ? "bg-navy-500" : e.action.startsWith("case.status") ? "bg-navy-700" : "bg-slate-400")} aria-hidden />
                <p className="text-sm text-slate-800">
                  <span className="font-medium">{e.actor ?? tr("System")}</span> — {localizeAuditSummary(e.summary, tr)}
                </p>
                <p className="text-xs text-slate-500">
                  <time dateTime={e.at}>{formatDate(e.at, { time: true, lang })}</time> · <code className="text-[11px]">{e.action}</code>
                </p>
                {e.body && <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 px-2 py-1 text-sm text-slate-700">{e.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card title={tr("Status history")}>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">{tr("No status changes.")}</p>
        ) : (
          <ul className="space-y-3">
            {history.map((h, i) => (
              <li key={i} className="text-sm">
                <p className="text-slate-800">
                  {h.from_status ? `${stateLabel(wf, h.from_status)} → ` : ""}
                  <span className="font-medium">{stateLabel(wf, h.to_status)}</span>
                </p>
                <p className="text-xs text-slate-500">{h.actor} · {formatDate(h.created_at, { time: true, lang })}</p>
                {h.reason && <p className="text-xs text-slate-600">{tr("Reason:")} {h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

async function RecordsTab({ user, c }: { user: AuthUser; c: CaseDetail }) {
  const tr = await getTr();
  const lang = await getLang();
  const attachments = listCaseAttachments(user, c.id, can(user, "audit.view"));
  const accept = Object.entries(ALLOWED_ATTACHMENT_TYPES).flatMap(([m, exts]) => [m, ...exts]).join(",");
  return (
    <div className="space-y-5">
      {can(user, "attachment.upload") && (
        <Card title={tr("Upload attachment")} description={tr("Files are stored encrypted when storage encryption is configured, outside the public web root.")}>
          <AttachmentUploader caseId={c.id} maxMb={Math.round(config.maxUploadBytes / 1024 / 1024)} accept={accept} />
        </Card>
      )}
      <Card title={tr("Attachments & evidence references")} padded={false}>
        <div className="px-4 pt-3">
          <Notice tone="slate">
            {tr("This is an application audit trail with SHA-256 checksums. It is not a certified chain-of-custody or tamper-proof evidence-integrity mechanism.")}
          </Notice>
        </div>
        {attachments.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Paperclip className="h-8 w-8" />} title={tr("No attachments")} description={tr("Uploaded documents, images and media for this case will appear here.")} />
          </div>
        ) : (
          <Table caption={tr("Attachments")}>
            <thead>
              <tr><Th>{tr("File")}</Th><Th>{tr("Type / size")}</Th><Th>{tr("Scan")}</Th><Th>{tr("Uploaded")}</Th><Th><span className="sr-only">{tr("Actions")}</span></Th></tr>
            </thead>
            <tbody>
              {attachments.map((a) => {
                const url = !a.deleted_at ? attachmentDownloadUrl(user, a.id) : null;
                return (
                  <tr key={a.id} className={cx(a.deleted_at && "opacity-60")}>
                    <Td>
                      <p className="font-medium text-slate-900">{a.filename}</p>
                      {a.description && <p className="text-xs text-slate-500">{a.description}</p>}
                      <p className="font-mono text-[10px] text-slate-400" title={tr("SHA-256 checksum")}>sha256 {a.sha256.slice(0, 16)}…</p>
                      {a.deleted_at && <p className="text-xs text-red-700">{tr("Deleted {date} by {name}", { date: formatDate(a.deleted_at, { lang }), name: a.deleter ?? "—" })} — {a.deletion_reason}</p>}
                    </Td>
                    <Td>{a.mime_type}<br /><span className="text-xs text-slate-500">{formatBytes(a.size_bytes)}</span></Td>
                    <Td>
                      <Badge tone={a.scan_status === "clean" ? "green" : a.scan_status === "infected" ? "red" : "slate"}>
                        {a.scan_status === "not_scanned" ? tr("Not scanned") : a.scan_status === "clean" ? tr("Clean") : tr("Infected")}
                      </Badge>
                    </Td>
                    <Td>{a.uploader}<br /><span className="text-xs text-slate-500">{formatDate(a.created_at, { time: true, lang })}</span></Td>
                    <Td className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {url ? (
                          <a href={url} className="text-sm font-medium text-[#111216] hover:underline">{tr("Download")}</a>
                        ) : !a.deleted_at ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="h-3 w-3" aria-hidden />{tr("Download restricted")}</span>
                        ) : null}
                        {!a.deleted_at && can(user, "attachment.delete") && <DeleteAttachmentForm attachmentId={a.id} filename={a.filename} />}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

async function AccessTab({ user, c, canAudit }: { user: AuthUser; c: CaseDetail; canAudit: boolean }) {
  const tr = await getTr();
  const lang = await getLang();
  const people = caseAccessList(user, c.id);
  const events = canAudit ? recentAccessEvents(user, c.id) : [];
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card title={tr("Who can open this case")} description={tr("Derived from roles, station and assignments. Access is denied unless explicitly granted.")} padded={false}>
        <Table caption={tr("Staff with access")}>
          <thead>
            <tr><Th>{tr("Name")}</Th><Th>{tr("Role")}</Th><Th>{tr("Access basis")}</Th><Th>{tr("Statements")}</Th></tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium text-slate-900">{p.name}</Td>
                <Td>{trDyn(tr, p.role_name)}</Td>
                <Td>{p.reason}</Td>
                <Td>{p.canViewStatements ? <Badge tone="blue">{tr("Can view")}</Badge> : <Badge>{tr("No access")}</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title={tr("Recent record access")} description={tr("Views, downloads and plays of this case's records.")} padded={false}>
        {!canAudit ? (
          <div className="p-4"><Notice tone="slate">{tr("Viewing access logs requires the audit permission.")}</Notice></div>
        ) : events.length === 0 ? (
          <div className="p-4"><p className="text-sm text-slate-500">{tr("No access recorded.")}</p></div>
        ) : (
          <Table caption={tr("Access events")}>
            <thead>
              <tr><Th>{tr("When")}</Th><Th>{tr("Who")}</Th><Th>{tr("Record")}</Th><Th>{tr("Action")}</Th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap">{formatDate(e.created_at, { time: true, lang })}</Td>
                  <Td>{e.actor}</Td>
                  <Td>{e.entity_type.replace(/_/g, " ")}</Td>
                  <Td>{e.action}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
