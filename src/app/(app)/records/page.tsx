import { trDyn } from "@/lib/i18n/dynamic";
import { localizeAuditSummary } from "@/lib/i18n/audit-summary";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getTr, getLang } from "@/lib/i18n/server";
import type { MsgKey, Tr } from "@/lib/i18n/messages";
import { requirePagePermission } from "@/lib/auth/session";
import { CAPTURE_METHOD_LABELS, DRAFT_STATUS_LABELS, formatBytes, formatDate } from "@/lib/format";
import { LANGUAGES } from "@/lib/domain/workflow";
import { Badge, Card, EmptyState, Notice, PageHeader, Pagination, Table, Tabs, Td, Th, buttonClass, inputClass, type Tone } from "@/components/ui";
import {
  tabAllowed, listStatements, listTranscripts, listDrafts, listReviews, listNotes, listAttachments, listAudit, listAccess,
  actorOptions, auditActionPrefixes, type RecordsTab, type RecordsFilters,
} from "./queries";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Records") };
}
const PAGE_SIZE = 25;

const TABS: { key: RecordsTab; label: MsgKey }[] = [
  { key: "statements", label: "Statements" },
  { key: "transcripts", label: "Transcripts" },
  { key: "drafts", label: "Drafts" },
  { key: "reviews", label: "Reviews" },
  { key: "notes", label: "Notes" },
  { key: "attachments", label: "Attachments" },
  { key: "audit", label: "Audit log" },
  { key: "access", label: "Access log" },
];

const STATUS_OPTIONS: Partial<Record<RecordsTab, { label: MsgKey; options: [string, string][] }>> = {
  statements: { label: "Status", options: [["in_progress", "Intake in progress"], ["completed", "Completed"], ["abandoned", "Abandoned"]] },
  transcripts: {
    label: "Source",
    options: [["typed_original", "Typed original"], ["manual_transcription", "Manual transcription"], ["automatic_transcription", "Automatic transcription"], ["assisted_entry", "Staff-assisted entry"], ["correction", "Correction"]],
  },
  drafts: { label: "Status", options: Object.entries(DRAFT_STATUS_LABELS) },
  reviews: { label: "Decision", options: [["clarification_requested", "Clarification requested"], ["reviewed", "Marked reviewed"]] },
  attachments: { label: "State", options: [["active", "Stored"], ["deleted", "Deleted"]] },
  access: { label: "Action", options: [["view", "Viewed"], ["download", "Downloaded"], ["play", "Played"], ["export", "Exported"]] },
};

const SOURCE_LABELS = Object.fromEntries(STATUS_OPTIONS.transcripts!.options);
const DRAFT_TONE: Record<string, Tone> = { draft: "slate", clarification_requested: "amber", reviewed: "blue" };

function CaseLink({ id, reference, tab, tr }: { id: string | null; reference: string | null; tab?: string; tr: Tr }) {
  if (!id) return <span className="text-xs text-slate-500">{tr("Intake (no case yet)")}</span>;
  return <Link href={`/cases/${id}${tab ? `?tab=${tab}` : ""}`} className="font-medium text-[#1B6650] hover:underline">{reference ?? tr("Case")}</Link>;
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("record.view", "audit.view");
  const tr = await getTr();
  const lang = await getLang();
  const sp = await searchParams;
  const allowed = TABS.filter((t) => tabAllowed(user, t.key));
  const tab = (allowed.find((t) => t.key === sp.tab)?.key ?? allowed[0]?.key) as RecordsTab | undefined;
  if (!tab) {
    return (
      <>
        <PageHeader title={tr("Records")} crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Records") }]} />
        <EmptyState title={tr("No record types available")} description={tr("Your role does not include access to any record type.")} />
      </>
    );
  }
  const f: RecordsFilters = {
    q: sp.q?.trim().slice(0, 60) || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    actor: sp.actor || undefined,
    status: sp.status || undefined,
    action: sp.action?.slice(0, 40) || undefined,
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: PAGE_SIZE,
  };
  const hrefFor = (p: number) => {
    const u = new URLSearchParams({ tab });
    for (const k of ["q", "from", "to", "actor", "status", "action"] as const) if (f[k]) u.set(k, String(f[k]));
    if (p > 1) u.set("page", String(p));
    return `/records?${u}`;
  };
  const actors = actorOptions(user);
  const statusOpt = STATUS_OPTIONS[tab];
  const filtered = !!(f.q || f.from || f.to || f.actor || f.status || f.action);

  return (
    <>
      <PageHeader
        title={tr("Records")}
        description={tr("Browse statements, transcripts, drafts, reviews, notes, attachments and audit history you are authorized to see. Lists show metadata only; open a record to view its content (access is logged).")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Records") }]}
      />
      <Tabs tabs={allowed.map((t) => ({ key: t.key, label: tr(t.label), href: `/records?tab=${t.key}` }))} active={tab} />

      {(tab === "audit" || tab === "access") && (
        <Notice tone="slate" className="mb-4">
          <span className="inline-flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {tab === "audit"
              ? tr("Application audit log — append-only at the application layer. Not a certified or tamper-proof evidence-integrity record.")
              : tr("Record access log — who viewed, played or downloaded sensitive records. Application-level log; not a certified chain-of-custody record.")}
          </span>
        </Notice>
      )}

      <Card padded={false}>
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4" role="search" aria-label={tr("Filter records")}>
          <input type="hidden" name="tab" value={tab} />
          <div className="min-w-40 flex-1">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">{tr("Case reference")}</label>
            <input id="q" name="q" defaultValue={f.q} placeholder={tr("e.g. CNT/2026")} maxLength={60} className={inputClass} />
          </div>
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium text-slate-600">{tr("From")}</label>
            <input id="from" name="from" type="date" defaultValue={f.from} className={inputClass} />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium text-slate-600">{tr("To")}</label>
            <input id="to" name="to" type="date" defaultValue={f.to} className={inputClass} />
          </div>
          <div>
            <label htmlFor="actor" className="mb-1 block text-xs font-medium text-slate-600">{tab === "audit" || tab === "access" ? tr("User") : tr("Author")}</label>
            <select id="actor" name="actor" defaultValue={f.actor ?? ""} className={inputClass}>
              <option value="">{tr("Anyone")}</option>
              {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {statusOpt && (
            <div>
              <label htmlFor="status" className="mb-1 block text-xs font-medium text-slate-600">{tr(statusOpt.label)}</label>
              <select id="status" name="status" defaultValue={f.status ?? ""} className={inputClass}>
                <option value="">{tr("Any")}</option>
                {statusOpt.options.map(([v, l]) => <option key={v} value={v}>{tr(l as MsgKey)}</option>)}
              </select>
            </div>
          )}
          {tab === "audit" && (
            <div>
              <label htmlFor="action" className="mb-1 block text-xs font-medium text-slate-600">{tr("Event type")}</label>
              <select id="action" name="action" defaultValue={f.action ?? ""} className={inputClass}>
                <option value="">{tr("All events")}</option>
                {auditActionPrefixes().map((p) => <option key={p} value={`${p}.`}>{p}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className={buttonClass("secondary")}>{tr("Apply")}</button>
          {filtered && <Link href={`/records?tab=${tab}`} className={buttonClass("ghost")}>{tr("Clear")}</Link>}
        </form>
        <TabTable tab={tab} user={user} f={f} filtered={filtered} hrefFor={hrefFor} tr={tr} lang={lang} />
      </Card>
    </>
  );
}

function Empty({ filtered, what, tr }: { filtered: boolean; what: MsgKey; tr: Tr }) {
  return (
    <div className="p-4">
      <EmptyState
        title={filtered ? tr("No {what} match these filters", { what: tr(what) }) : tr("No {what} yet", { what: tr(what) })}
        description={filtered ? tr("Try widening the date range or clearing filters.") : tr("Records you are authorized to see will appear here.")}
      />
    </div>
  );
}

function TabTable({ tab, user, f, filtered, hrefFor, tr, lang }: {
  tab: RecordsTab; user: Awaited<ReturnType<typeof requirePagePermission>>; f: RecordsFilters; filtered: boolean; hrefFor: (p: number) => string; tr: Tr; lang: string;
}) {
  const pager = (total: number) => <Pagination page={f.page} pageSize={f.pageSize} total={total} hrefFor={hrefFor} />;

  if (tab === "statements") {
    const { rows, total } = listStatements(user, f);
    if (!rows.length) return <Empty filtered={filtered} what="statements" tr={tr} />;
    return (
      <>
        <Table caption={tr("Statements")}>
          <thead><tr><Th>{tr("Intake")}</Th><Th>{tr("Case")}</Th><Th>{tr("Method")}</Th><Th>{tr("Language")}</Th><Th>{tr("Recording consent")}</Th><Th>{tr("Versions")}</Th><Th>{tr("Status")}</Th><Th>{tr("Recorded by")}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><Link href={`/statements/${r.id}`} className="font-medium text-[#1B6650] hover:underline">{formatDate(r.intake_at, { time: true, lang })}</Link><p className="text-xs text-slate-500">{r.station_code}</p></Td>
                <Td><CaseLink tr={tr} id={r.case_id} reference={r.reference} /></Td>
                <Td className="text-xs">{r.capture_method ? tr(CAPTURE_METHOD_LABELS[r.capture_method] as MsgKey) : tr("Not chosen")}</Td>
                <Td className="text-xs">{LANGUAGES[r.language] ? tr(LANGUAGES[r.language].label as MsgKey) : r.language}</Td>
                <Td>{r.consent ? <Badge tone={r.consent === "granted" ? "green" : r.consent === "declined" ? "slate" : "amber"}>{tr(r.consent as MsgKey)}</Badge> : <span className="text-xs text-slate-400">{tr("Not requested")}</span>}</Td>
                <Td className="text-xs">{tr("{n} transcript · {m} recording", { n: r.transcript_versions, m: r.recordings })}</Td>
                <Td><Badge tone={r.status === "completed" ? "green" : r.status === "abandoned" ? "slate" : "blue"}>{tr(r.status === "completed" ? "Completed" : r.status === "abandoned" ? "Abandoned" : "In progress")}</Badge></Td>
                <Td className="text-xs">{r.created_by_name}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {pager(total)}
      </>
    );
  }

  if (tab === "transcripts") {
    const { rows, total } = listTranscripts(user, f);
    if (!rows.length) return <Empty filtered={filtered} what="transcript versions" tr={tr} />;
    return (
      <>
        <Table caption={tr("Transcript versions")}>
          <thead><tr><Th>{tr("Version")}</Th><Th>{tr("Case")}</Th><Th>{tr("Source")}</Th><Th>{tr("Language")}</Th><Th>{tr("Length")}</Th><Th>{tr("Created")}</Th><Th>{tr("By")}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/statements/${r.statement_id}`} className="font-medium text-[#1B6650] hover:underline">v{r.version}</Link>
                  {r.has_uncertainty ? <Badge tone="amber" className="ml-2">{tr("Uncertainty noted")}</Badge> : null}
                </Td>
                <Td><CaseLink tr={tr} id={r.case_id} reference={r.reference} /></Td>
                <Td className="text-xs">{SOURCE_LABELS[r.source] ? tr(SOURCE_LABELS[r.source] as MsgKey) : r.source}{r.recording_id ? ` ${tr("(linked to recording)")}` : ""}</Td>
                <Td className="text-xs">{LANGUAGES[r.language] ? tr(LANGUAGES[r.language].label as MsgKey) : r.language}</Td>
                <Td className="text-xs">{tr("{n} chars", { n: r.chars.toLocaleString() })}</Td>
                <Td className="text-xs">{formatDate(r.created_at, { time: true, lang })}</Td>
                <Td className="text-xs">{r.created_by_name}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {pager(total)}
      </>
    );
  }

  if (tab === "drafts") {
    const { rows, total } = listDrafts(user, f);
    if (!rows.length) return <Empty filtered={filtered} what="drafts" tr={tr} />;
    return (
      <>
        <Table caption={tr("FIR drafts")}>
          <thead><tr><Th>{tr("Draft")}</Th><Th>{tr("Case")}</Th><Th>{tr("Status")}</Th><Th>{tr("Current version")}</Th><Th>{tr("Template")}</Th><Th>{tr("Reviewed")}</Th><Th>{tr("Updated")}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><Link href={`/statements/${r.statement_id}/review?draft=${r.id}`} className="font-medium text-[#1B6650] hover:underline">{tr("Open draft")}</Link><p className="text-xs text-slate-500">{tr("by {name}", { name: r.created_by_name })}</p></Td>
                <Td><CaseLink tr={tr} id={r.case_id} reference={r.reference} /></Td>
                <Td><Badge tone={DRAFT_TONE[r.status] ?? "slate"}>{DRAFT_STATUS_LABELS[r.status] ? tr(DRAFT_STATUS_LABELS[r.status] as MsgKey) : r.status}</Badge></Td>
                <Td className="text-xs">
                  v{r.current_version}{" "}
                  {r.origin && <Badge tone={r.origin === "human" ? "slate" : "blue"}>{r.origin === "ai" ? tr("AI-generated") : r.origin === "demo" ? tr("Rule-based draft") : tr("Human-edited")}</Badge>}
                </Td>
                <Td className="text-xs">{r.template_name} (v{r.template_version})</Td>
                <Td className="text-xs">{r.reviewed_at ? `${r.reviewed_by_name} · ${formatDate(r.reviewed_at, { lang })}` : "—"}</Td>
                <Td className="text-xs">{formatDate(r.updated_at, { time: true, lang })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{tr("A reviewed draft is not an official FIR. Filing status is shown on each case.")}</p>
        {pager(total)}
      </>
    );
  }

  if (tab === "reviews") {
    const { rows, total } = listReviews(user, f);
    if (!rows.length) return <Empty filtered={filtered} what="review decisions" tr={tr} />;
    return (
      <>
        <Table caption={tr("Review decisions")}>
          <thead><tr><Th>{tr("Decision")}</Th><Th>{tr("Case")}</Th><Th>{tr("Draft version")}</Th><Th>{tr("Reviewer")}</Th><Th>{tr("Comment")}</Th><Th>{tr("Open comments")}</Th><Th>{tr("Date")}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><Link href={`/statements/${r.statement_id}/review?draft=${r.draft_id}`} className="hover:underline"><Badge tone={r.decision === "reviewed" ? "blue" : "amber"}>{r.decision === "reviewed" ? tr("Marked reviewed") : tr("Clarification requested")}</Badge></Link></Td>
                <Td><CaseLink tr={tr} id={r.case_id} reference={r.reference} /></Td>
                <Td className="text-xs">v{r.draft_version}</Td>
                <Td className="text-xs">{r.reviewer_name}</Td>
                <Td className="text-xs">{r.has_comment ? tr("Recorded") : "—"}</Td>
                <Td className="text-xs">{r.open_comments}</Td>
                <Td className="text-xs">{formatDate(r.created_at, { time: true, lang })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {pager(total)}
      </>
    );
  }

  if (tab === "notes") {
    const { rows, total } = listNotes(user, f);
    if (!rows.length) return <Empty filtered={filtered} what="internal notes" tr={tr} />;
    return (
      <>
        <Table caption={tr("Internal notes")}>
          <thead><tr><Th>{tr("Case")}</Th><Th>{tr("Author")}</Th><Th>{tr("Length")}</Th><Th>{tr("Added")}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><CaseLink tr={tr} id={r.case_id} reference={r.reference} tab="timeline" /></Td>
                <Td className="text-xs">{r.author_name}</Td>
                <Td className="text-xs">{tr("{n} chars", { n: r.chars.toLocaleString() })}</Td>
                <Td className="text-xs">{formatDate(r.created_at, { time: true, lang })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {pager(total)}
      </>
    );
  }

  if (tab === "attachments") {
    const { rows, total } = listAttachments(user, f);
    if (!rows.length) return <Empty filtered={filtered} what="attachments" tr={tr} />;
    return (
      <>
        <Table caption={tr("Attachments")}>
          <thead><tr><Th>{tr("File")}</Th><Th>{tr("Case")}</Th><Th>{tr("Type")}</Th><Th>{tr("Size")}</Th><Th>{tr("Scan")}</Th><Th>{tr("Uploaded")}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  {r.case_id ? (
                    <Link href={`/cases/${r.case_id}?tab=records`} className="font-medium text-[#1B6650] hover:underline">{r.filename}</Link>
                  ) : (
                    <span className="font-medium text-slate-800">{r.filename}</span>
                  )}
                  {r.deleted_at && <Badge tone="slate" className="ml-2">{tr("Deleted {date}", { date: formatDate(r.deleted_at, { lang }) })}</Badge>}
                </Td>
                <Td><CaseLink tr={tr} id={r.case_id} reference={r.reference} tab="records" /></Td>
                <Td className="text-xs">{r.mime_type}</Td>
                <Td className="text-xs">{formatBytes(r.size_bytes)}</Td>
                <Td>
                  <Badge tone={r.scan_status === "clean" ? "green" : r.scan_status === "infected" ? "red" : "slate"}>
                    {r.scan_status === "not_scanned" ? tr("Not scanned") : tr(r.scan_status === "clean" ? "Clean" : "Infected")}
                  </Badge>
                </Td>
                <Td className="text-xs">{r.uploaded_by_name} · {formatDate(r.created_at, { lang })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{tr("Malware scanning is not configured for this deployment; files are validated by type, size and content signature only.")}</p>
        {pager(total)}
      </>
    );
  }

  if (tab === "audit") {
    const { rows, total } = listAudit(user, f);
    if (!rows.length) return <Empty filtered={filtered} what="audit events" tr={tr} />;
    return (
      <>
        <Table caption={tr("Audit events")}>
          <thead><tr><Th>#</Th><Th>{tr("When")}</Th><Th>{tr("Actor")}</Th><Th>{tr("Event")}</Th><Th>{tr("Case")}</Th><Th>IP</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs text-slate-400">{r.seq}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDate(r.created_at, { time: true, lang })}</Td>
                <Td className="text-xs">{r.actor_name ?? tr("System")}</Td>
                <Td>{localizeAuditSummary(r.summary, tr)}<p className="font-mono text-[11px] text-slate-400">{r.action} · {r.entity_type}</p></Td>
                <Td>{r.case_id ? <CaseLink tr={tr} id={r.case_id} reference={r.reference} tab="timeline" /> : <span className="text-xs text-slate-400">—</span>}</Td>
                <Td className="font-mono text-xs text-slate-500">{r.ip ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {pager(total)}
      </>
    );
  }

  const { rows, total } = listAccess(user, f);
  if (!rows.length) return <Empty filtered={filtered} what="access events" tr={tr} />;
  return (
    <>
      <Table caption={tr("Record access events")}>
        <thead><tr><Th>{tr("When")}</Th><Th>{tr("User")}</Th><Th>{tr("Action")}</Th><Th>{tr("Record")}</Th><Th>{tr("Case")}</Th><Th>IP</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <Td className="whitespace-nowrap text-xs">{formatDate(r.created_at, { time: true, lang })}</Td>
              <Td className="text-xs">{r.user_name}</Td>
              <Td><Badge tone={r.action === "download" || r.action === "export" ? "amber" : "slate"}>{tr(({ view: "Viewed", download: "Downloaded", play: "Played", export: "Exported" } as Record<string, MsgKey>)[r.action] ?? (r.action as MsgKey))}</Badge></Td>
              <Td className="text-xs">{r.entity_type} <span className="font-mono text-[11px] text-slate-400">{r.entity_id.slice(0, 8)}</span></Td>
              <Td>{r.case_id ? <CaseLink tr={tr} id={r.case_id} reference={r.reference} /> : <span className="text-xs text-slate-400">—</span>}</Td>
              <Td className="font-mono text-xs text-slate-500">{r.ip ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {pager(total)}
    </>
  );
}
