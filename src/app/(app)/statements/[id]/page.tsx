import Link from "next/link";
import { notFound } from "next/navigation";
import { Mic, Video } from "lucide-react";
import { requirePagePermission, requestIp } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { NotFoundError } from "@/lib/errors";
import { get } from "@/lib/db";
import { recordAccess } from "@/lib/audit";
import { createFileToken } from "@/lib/storage";
import { LANGUAGES } from "@/lib/domain/workflow";
import { listConsents, listRecordings, listTranscripts, loadStatement, STEP_LABELS, TRANSCRIPT_SOURCE_LABELS, type StatementRow } from "@/lib/domain/statements";
import { listDraftsForStatement } from "@/lib/domain/drafts";
import { CAPTURE_METHOD_LABELS, PARTY_ROLE_LABELS, formatBytes, formatDate, formatDuration } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, KeyValue, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { DraftStatusBadge } from "@/components/drafts/review-workspace";
import { DiffView } from "@/components/drafts/source-text";
import { diffWords } from "@/components/drafts/diff";
import { formatTimestamp } from "@/components/intake/timestamps";
import { LegalPanel } from "@/components/legal/legal-panel";
import { getTr, getLang } from "@/lib/i18n/server";
import { trDyn } from "@/lib/i18n/dynamic";

export async function generateMetadata() {
  return { title: (await getTr())("Statement record") };
}

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const user = await requirePagePermission("statement.view", "statement.create");
  const tr = await getTr();
  const lang = await getLang();
  const consentLabel = (v: string) => trDyn(tr, ({ granted: "Granted", declined: "Declined", withdrawn: "Withdrawn", audio: "Audio", video: "Video" } as Record<string, string>)[v] ?? v);
  const { id } = await params;
  const sp = await searchParams;
  let s: StatementRow;
  try {
    s = loadStatement(user, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  recordAccess({ userId: user.id, entityType: "statement", entityId: s.id, caseId: s.case_id, action: "view", ip: await requestIp() });

  const pii = can(user, "party.view_pii");
  const consents = listConsents(s.id);
  const recordings = listRecordings(s.id);
  const transcripts = listTranscripts(s.id);
  const drafts = listDraftsForStatement(s.id);
  const caseRow = s.case_id ? get<{ id: string; reference: string }>("SELECT id, reference FROM cases WHERE id = ?", s.case_id) : undefined;
  const creator = get<{ name: string }>("SELECT name FROM users WHERE id = ?", s.created_by)?.name;
  const confirmer = s.transcript_confirmed_by ? get<{ name: string }>("SELECT name FROM users WHERE id = ?", s.transcript_confirmed_by)?.name : null;

  const latest = transcripts[transcripts.length - 1];
  const bVer = Number(sp.b) || latest?.version;
  const aVer = Number(sp.a) || (bVer ? bVer - 1 : undefined);
  const A = transcripts.find((t) => t.version === aVer);
  const B = transcripts.find((t) => t.version === bVer);

  return (
    <>
      <PageHeader
        title={tr("Statement record")}
        crumbs={caseRow ? [{ label: tr("Cases"), href: "/cases" }, { label: caseRow.reference, href: `/cases/${caseRow.id}` }, { label: tr("Statement") }] : [{ label: tr("New Report"), href: "/intake" }, { label: tr("Statement") }]}
        meta={
          <>
            <Badge tone={s.status === "completed" ? "green" : s.status === "in_progress" ? "blue" : "slate"}>{s.status === "in_progress" ? tr("In progress — {step}", { step: trDyn(tr, STEP_LABELS[s.current_step]) }) : s.status === "completed" ? tr("Completed") : tr("Abandoned")}</Badge>
            {caseRow ? <Link href={`/cases/${caseRow.id}`} className="text-sm font-medium text-[#111216] hover:underline">{caseRow.reference}</Link> : <span className="text-xs text-slate-500">{tr("Not yet linked to a case")}</span>}
          </>
        }
        actions={
          <>
            {s.status === "in_progress" && <ButtonLink href={`/intake/${s.id}?step=${s.current_step}`} variant="primary" size="sm">{tr("Resume intake")}</ButtonLink>}
            {drafts[0] && <ButtonLink href={`/statements/${s.id}/review?draft=${drafts[0].id}`} size="sm">{tr("Open draft review")}</ButtonLink>}
          </>
        }
      />
      <Notice tone="slate" className="mb-5">{tr("Access to this record is logged. Original recordings and transcript versions are preserved and cannot be edited.")}</Notice>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title={tr("Intake")} className="lg:col-span-2">
          <KeyValue items={[
            { label: tr("Intake time"), value: formatDate(s.intake_at, { time: true, lang }) },
            { label: tr("Capture officer"), value: creator },
            { label: tr("Language"), value: trDyn(tr, LANGUAGES[s.language]?.label ?? s.language) },
            { label: tr("Capture method"), value: s.capture_method ? trDyn(tr, CAPTURE_METHOD_LABELS[s.capture_method]) : tr("Not chosen") },
            { label: tr("Incident type (intake)"), value: s.incident_type },
            { label: tr("Incident date (intake)"), value: s.incident_date ? formatDate(s.incident_date, { time: true, lang }) : null },
            { label: tr("Incident location (intake)"), value: s.incident_location },
            { label: tr("Speaker"), value: pii ? `${s.speaker_name ?? tr("Not recorded")} (${trDyn(tr, PARTY_ROLE_LABELS[s.speaker_role] ?? s.speaker_role)})` : tr("Restricted") },
            { label: tr("Contact"), value: pii ? s.speaker_contact : s.speaker_contact ? tr("Restricted") : null },
            { label: tr("Address"), value: pii ? s.speaker_address : s.speaker_address ? tr("Restricted") : null },
            ...(s.accessibility_notes ? [{ label: tr("Accessibility support"), value: s.accessibility_notes }] : []),
            ...(s.interpreter_name ? [{ label: tr("Interpreter / assisting person"), value: s.interpreter_name }] : []),
          ]} />
        </Card>
        <Card title={tr("Transcript confirmation")}>
          {s.transcript_confirmed_at ? (
            <p className="text-sm text-slate-700">{tr("Confirmed by {name} on {date} after read-back to the speaker (transcript v{version}).", { name: confirmer ?? "—", date: formatDate(s.transcript_confirmed_at, { time: true, lang }), version: latest?.version ?? "—" })}</p>
          ) : (
            <p className="text-sm text-slate-600">{latest ? tr("Not confirmed (latest version v{version}).", { version: latest.version }) : tr("Not confirmed.")}</p>
          )}
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={tr("Consent log")} description={tr("Append-only record of what was explained and decided.")}>
          {consents.length === 0 ? (
            <p className="text-sm text-slate-600">{s.capture_method === "audio" || s.capture_method === "video" ? tr("No consent decision recorded.") : tr("Not applicable — no recording method was used.")}</p>
          ) : (
            <ul className="space-y-3">
              {consents.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={c.decision === "granted" ? "green" : c.decision === "declined" ? "slate" : "amber"}>{consentLabel(c.decision)}</Badge>
                    <span className="text-slate-700">{consentLabel(c.scope)} · {formatDate(c.created_at, { time: true, lang })} · {c.recorded_by_name}</span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-600">{tr("Notice shown (version {version}, {language})", { version: c.notice_version, language: trDyn(tr, LANGUAGES[c.notice_language]?.label ?? c.notice_language) })}</summary>
                    <p lang={c.notice_language} className="mt-1 whitespace-pre-line rounded bg-slate-50 p-2 text-xs text-slate-700">{c.notice_text}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={tr("Recordings")}>
          {recordings.length === 0 ? (
            <p className="text-sm text-slate-600">{tr("No recordings.")}</p>
          ) : (
            <ul className="space-y-3">
              {recordings.map((r, i) => {
                const url = r.status === "stored" && can(user, "recording.view") ? `/api/recordings/${r.id}?token=${encodeURIComponent(createFileToken("recording", r.id, user.id))}` : null;
                return (
                  <li key={r.id} className="text-sm">
                    <p className="flex flex-wrap items-center gap-2 text-slate-800">
                      {r.kind === "video" ? <Video className="h-4 w-4 text-slate-500" aria-hidden /> : <Mic className="h-4 w-4 text-slate-500" aria-hidden />}
                      <span className="font-medium">{tr("Recording {n}", { n: i + 1 })}</span>
                      <span className="text-slate-500">{formatDuration(r.duration_ms)} · {formatBytes(r.size_bytes)} · {formatDate(r.created_at, { time: true, lang })} · {r.created_by_name}</span>
                      {r.status === "deleted" && <Badge tone="slate">{tr("Deleted")} {formatDate(r.deleted_at, { lang })}{r.deletion_reason ? ` — ${r.deletion_reason}` : ""}</Badge>}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400" title={r.sha256}>SHA-256 {r.sha256.slice(0, 24)}… {tr("(integrity reference, not a certified chain of custody)")}</p>
                    {url && (r.kind === "video" ? <video src={url} controls preload="metadata" className="mt-1 max-h-64 rounded bg-slate-900" /> : <audio src={url} controls preload="metadata" className="mt-1 w-full" />)}
                    {r.status === "stored" && !url && <p className="text-xs text-slate-500">{tr("Your role cannot play recordings.")}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title={tr("Transcript versions")} className="mt-5" description={tr("Each version is immutable. Corrections are added as new versions.")}>
        <div id="transcripts" className="scroll-mt-20" />
        {transcripts.length === 0 ? (
          <EmptyState title={tr("No transcript yet")} />
        ) : (
          <>
            <Table caption={tr("Transcript versions")}>
              <thead><tr><Th>{tr("Version")}</Th><Th>{tr("Source")}</Th><Th>{tr("By")}</Th><Th>{tr("When")}</Th><Th>{tr("Note")}</Th><Th>{tr("Compare")}</Th></tr></thead>
              <tbody>
                {[...transcripts].reverse().map((t) => (
                  <tr key={t.id}>
                    <Td className="font-medium">v{t.version}{t.version === latest?.version && <Badge tone="blue" className="ml-1">{tr("Latest")}</Badge>}</Td>
                    <Td>{trDyn(tr, TRANSCRIPT_SOURCE_LABELS[t.source])}{t.segments.length > 0 && <span className="block text-xs text-slate-500">{tr("{n} timestamped passage(s)", { n: t.segments.length })}</span>}</Td>
                    <Td>{t.created_by_name}</Td>
                    <Td>{formatDate(t.created_at, { time: true, lang })}</Td>
                    <Td className="max-w-xs text-xs">{t.note ?? "—"}{t.uncertainty_note && <span className="block text-amber-800">{tr("Uncertain:")} {t.uncertainty_note}</span>}</Td>
                    <Td>{t.version > 1 ? <Link className="text-[#111216] hover:underline" href={`/statements/${s.id}?a=${t.version - 1}&b=${t.version}#transcripts`}>{tr("vs v{n}", { n: t.version - 1 })}</Link> : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {B && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-900">{A ? tr("Changes from v{a} to v{b}", { a: A.version, b: B.version }) : tr("Version {n}", { n: B.version })}</h3>
                <p className="mb-2 text-xs text-slate-500">{A ? tr("Green = added, red = removed.") : tr("Original text.")}</p>
                <p className="mb-1.5 text-xs font-medium text-slate-500">{tr("Verbatim — speaker's own words")}</p>
                <div className="rounded-md border border-slate-200 border-l-2 border-l-slate-400 bg-slate-50 p-4 text-[15px] leading-relaxed text-slate-800">
                  {A ? <DiffView parts={diffWords(A.text, B.text)} lang={s.language} /> : <p lang={s.language} className="whitespace-pre-wrap text-sm">{B.text}</p>}
                </div>
                {B.segments.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-600">{tr("Timestamped passages in v{n}", { n: B.version })}</summary>
                    <ul className="mt-1 space-y-1 text-xs text-slate-700">
                      {B.segments.map((seg, i) => <li key={i}><span className="font-mono text-slate-500">[{formatTimestamp(seg.offsetMs)}]</span> <span lang={s.language}>{seg.text.slice(0, 200)}</span></li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      <Card title={tr("Drafts")} className="mt-5">
        {drafts.length === 0 ? (
          <p className="text-sm text-slate-600">{tr("No draft has been prepared.")}</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                <DraftStatusBadge status={d.status} />
                <span className="text-slate-700">{tr("Version {n} · updated {date}", { n: d.current_version, date: formatDate(d.updated_at, { time: true, lang }) })}</span>
                <Link href={`/statements/${s.id}/review?draft=${d.id}`} className="font-medium text-[#111216] hover:underline">{tr("Open review")}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-5">
        <LegalPanel user={user} statementId={s.id} />
      </div>
    </>
  );
}
