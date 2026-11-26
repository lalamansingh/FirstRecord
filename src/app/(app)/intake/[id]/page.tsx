import type { MsgKey, Tr } from "@/lib/i18n/messages";
import { getTr, getLang } from "@/lib/i18n/server";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bot, CheckCircle2, FileText, Mic, ShieldAlert, Video } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can, type AuthUser } from "@/lib/rbac/access";
import { NotFoundError } from "@/lib/errors";
import { get as dbGet } from "@/lib/db";
import { getSetting, getWorkflow, LANGUAGES, stateLabel } from "@/lib/domain/workflow";
import {
  applicableSteps,
  currentConsent,
  listConsents,
  listRecordings,
  listTranscripts,
  loadStatement,
  stepCompletion,
  STEP_LABELS,
  STEPS,
  TRANSCRIPT_SOURCE_LABELS,
  type StatementRow,
  type Step,
} from "@/lib/domain/statements";
import { getActiveTemplate, listDraftsForStatement, listVersions } from "@/lib/domain/drafts";
import { assignableUsers, initialCaseStatus } from "@/lib/domain/case-create";
import { findPossibleDuplicates } from "@/lib/domain/duplicates";
import { aiStatusNote, getAIProvider } from "@/lib/ai";
import { demoProvider } from "@/lib/ai/demo";
import { createFileToken } from "@/lib/storage";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { CAPTURE_METHOD_LABELS, formatBytes, formatDate, formatDuration, OFFICIAL_STATUS_LABELS, toLocalInput } from "@/lib/format";
import { Badge, ButtonLink, Card, KeyValue, Notice, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Stepper } from "@/components/intake/stepper";
import { IntakeForm } from "@/components/intake/intake-form";
import { MethodForm } from "@/components/intake/method-form";
import { ConsentPanel, type ConsentNotice } from "@/components/intake/consent-panel";
import { Recorder } from "@/components/intake/recorder";
import { TranscriptEditor, type PlayableRecording } from "@/components/intake/transcript-editor";
import { CaseForm } from "@/components/intake/case-form";
import { ReviewWorkspace, DraftStatusBadge } from "@/components/drafts/review-workspace";
import {
  abandonAction,
  confirmTranscriptAction,
  consentAction,
  createCaseAction,
  generateDraftAction,
  saveTranscriptAction,
  setMethodAction,
  updateIntakeAction,
  withdrawConsentAction,
} from "../actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Report intake") };
}

function languageOptions() {
  return getSetting("languages.enabled").filter((c) => c in LANGUAGES).map((c) => ({ code: c, label: `${LANGUAGES[c].label} (${LANGUAGES[c].native})` }));
}

function playable(user: AuthUser, s: StatementRow, tr: Tr, uiLang: string): PlayableRecording[] {
  if (!can(user, "recording.view")) return [];
  return listRecordings(s.id)
    .filter((r) => r.status === "stored")
    .map((r, i) => ({
      id: r.id,
      kind: r.kind,
      url: `/api/recordings/${r.id}?token=${encodeURIComponent(createFileToken("recording", r.id, user.id))}`,
      label: `${tr("Recording {n}", { n: i + 1 })} (${trDyn(tr, r.kind === "video" ? "Video" : "Audio")}, ${formatDuration(r.duration_ms)}, ${formatDate(r.created_at, { time: true, lang: uiLang })})`,
    }));
}

export default async function IntakeWizardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string; v?: string }> }) {
  const tr = await getTr();
  const uiLang = await getLang();
  const user = await requirePagePermission("statement.create", "statement.edit", "statement.view");
  const { id } = await params;
  const sp = await searchParams;
  let s: StatementRow;
  try {
    s = loadStatement(user, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const steps = applicableSteps(s);
  const completion = stepCompletion(s);
  let step = (STEPS as readonly string[]).includes(sp.step ?? "") ? (sp.step as Step) : s.current_step;
  if (!steps.includes(step)) step = steps[Math.min(steps.length - 1, Math.max(0, steps.indexOf(s.current_step)))] ?? "intake";
  if (s.status === "completed" && step !== "complete" && step !== "review") redirect(`/intake/${id}?step=complete`);
  if (s.status !== "completed" && step === "complete") redirect(`/intake/${id}?step=case`);
  const furthest = STEPS.indexOf(s.current_step);
  const reachable = (st: Step) =>
    s.status === "completed"
      ? st === "complete" || st === "review"
      : STEPS.indexOf(st) <= furthest || completion[st] || (completion.transcript && (st === "draft" || st === "review" || st === "case"));
  if (!reachable(step) && s.status === "in_progress") redirect(`/intake/${id}?step=${s.current_step}`);

  const canEdit = can(user, "statement.edit") && s.status === "in_progress";
  const lang = s.language;

  return (
    <>
      <PageHeader
        title={tr("Report intake")}
        crumbs={[{ label: tr("New Report"), href: "/intake" }, { label: s.speaker_name && can(user, "party.view_pii") ? tr("Report — {name}", { name: s.speaker_name }) : tr("Report") }]}
        meta={
          <>
            <Badge tone={s.status === "in_progress" ? "blue" : s.status === "completed" ? "green" : "slate"}>{s.status === "in_progress" ? tr("In progress") : s.status === "completed" ? tr("Completed") : tr("Abandoned")}</Badge>
            <span className="text-xs text-slate-500">{tr("Started {date}", { date: formatDate(s.intake_at, { time: true, lang: uiLang }) })} · {trDyn(tr, LANGUAGES[lang]?.label ?? lang)}{s.capture_method ? ` · ${trDyn(tr, CAPTURE_METHOD_LABELS[s.capture_method])}` : ""}</span>
          </>
        }
        actions={<ButtonLink href={`/statements/${s.id}`} size="sm"><FileText className="h-3.5 w-3.5" aria-hidden /> {tr("Statement record")}</ButtonLink>}
      />
      {s.status === "abandoned" && <Notice tone="red" title={tr("This report was abandoned")} className="mb-4">{tr("It is read-only. The record and its audit history are kept.")}</Notice>}
      <Stepper statementId={s.id} steps={steps} active={step} completion={completion} reachable={reachable} />

      <h2 className="mb-3 text-base font-semibold text-slate-900">
        {steps.indexOf(step) + 1}. {tr(STEP_LABELS[step] as MsgKey)}
      </h2>

      {step === "intake" && <IntakeStep user={user} s={s} canEdit={canEdit} />}
      {step === "method" && (
        <Card>
          <MethodForm action={setMethodAction} statementId={s.id} current={s.capture_method} canRecord={can(user, "recording.create")} accessibilityNotes={s.accessibility_notes ?? ""} interpreterName={s.interpreter_name ?? ""} locked={!canEdit} />
        </Card>
      )}
      {step === "consent" && <ConsentStep user={user} s={s} canEdit={canEdit} />}
      {step === "capture" && <CaptureStep user={user} s={s} canEdit={canEdit} />}
      {step === "transcript" && <TranscriptStep user={user} s={s} canEdit={canEdit} />}
      {step === "draft" && <DraftStep user={user} s={s} canEdit={canEdit} />}
      {step === "review" && <ReviewStep user={user} s={s} version={sp.v ? Number(sp.v) : undefined} />}
      {step === "case" && <CaseStep user={user} s={s} />}
      {step === "complete" && <CompleteStep user={user} s={s} />}

      {canEdit && step !== "case" && (
        <details className="mt-10 rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">{tr("Abandon this report")}</summary>
          <ActionForm action={abandonAction} danger confirmTitle={tr("Abandon this report?")} confirmLabel={tr("Abandon report")} confirm={tr("The report will be closed without creating a case. Everything recorded so far, including consent and audit history, is kept.")} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="statementId" value={s.id} />
            <div className="min-w-64 flex-1">
              <label htmlFor="abandon-reason" className="mb-1 block text-sm text-slate-700">{tr("Reason")}</label>
              <input id="abandon-reason" name="reason" required maxLength={500} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={tr("e.g. Duplicate of an earlier report; person left before giving statement")} />
            </div>
            <SubmitButton variant="danger">{tr("Abandon")}</SubmitButton>
          </ActionForm>
        </details>
      )}
    </>
  );
}

async function NextLink({ id, step, label }: { id: string; step: Step; label?: string }) {
  const tr = await getTr();
  return (
    <div className="mt-4 flex justify-end">
      <ButtonLink href={`/intake/${id}?step=${step}`} variant="primary">{label ?? `${tr("Continue")}: ${tr(STEP_LABELS[step] as MsgKey)}`}</ButtonLink>
    </div>
  );
}

async function IntakeStep({ user, s, canEdit }: { user: AuthUser; s: StatementRow; canEdit: boolean }) {
  const tr = await getTr();
  const uiLang = await getLang();
  if (!canEdit) {
    return (
      <Card>
        <KeyValue items={[
          { label: tr("Intake time"), value: formatDate(s.intake_at, { time: true, lang: uiLang }) },
          { label: tr("Language"), value: LANGUAGES[s.language]?.label ?? s.language },
          { label: tr("Incident type"), value: s.incident_type },
          { label: tr("Incident date"), value: s.incident_date },
          { label: tr("Incident location"), value: s.incident_location },
          { label: tr("Speaker"), value: can(user, "party.view_pii") ? s.speaker_name : "Restricted" },
        ]} />
      </Card>
    );
  }
  return (
    <Card>
      <IntakeForm
        action={updateIntakeAction}
        stationName={user.stationName ?? ""}
        officerName={user.name}
        incidentTypes={getSetting("incident.types")}
        languages={languageOptions()}
        requireContact={getSetting("intake.require_contact")}
        submitLabel={tr("Save and continue")}
        defaults={{
          statementId: s.id,
          intakeAt: toLocalInput(s.intake_at),
          incidentType: s.incident_type ?? "",
          incidentDate: s.incident_date ?? "",
          incidentLocation: s.incident_location ?? "",
          language: s.language,
          speakerName: can(user, "party.view_pii") ? s.speaker_name ?? "" : "",
          speakerContact: can(user, "party.view_pii") ? s.speaker_contact ?? "" : "",
          speakerAddress: can(user, "party.view_pii") ? s.speaker_address ?? "" : "",
          speakerRole: s.speaker_role,
        }}
      />
    </Card>
  );
}

async function ConsentHistory({ s }: { s: StatementRow }) {
  const tr = await getTr();
  const uiLang = await getLang();
  const events = listConsents(s.id);
  if (events.length === 0) return null;
  return (
    <Card title={tr("Consent log")} description={tr("Append-only. Each entry stores the notice text that was shown.")}>
      <ul className="space-y-1.5 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2">
            <Badge tone={e.decision === "granted" ? "green" : e.decision === "declined" ? "slate" : "amber"}>{e.decision}</Badge>
            <span className="text-slate-700">{e.scope} · notice {e.notice_version} ({LANGUAGES[e.notice_language]?.label ?? e.notice_language}) · recorded by {e.recorded_by_name} · {formatDate(e.created_at, { time: true, lang: uiLang })}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function ConsentStep({ user, s, canEdit }: { user: AuthUser; s: StatementRow; canEdit: boolean }) {
  const tr = await getTr();
  const uiLang = await getLang();
  const scope = s.capture_method === "video" ? "video" : "audio";
  if (s.capture_method !== "audio" && s.capture_method !== "video") {
    return (
      <>
        <Notice tone="slate">{tr("Consent is only needed for audio or video recording. This report uses: {method}.", { method: s.capture_method ? trDyn(tr, CAPTURE_METHOD_LABELS[s.capture_method]) : tr("no capture method yet") })}</Notice>
        <ConsentHistory s={s} />
        <NextLink id={s.id} step="capture" />
      </>
    );
  }
  const cur = currentConsent(s.id, scope);
  const notices: ConsentNotice[] = getSetting("languages.enabled")
    .filter((c) => c in LANGUAGES)
    .map((c) => ({
      code: c,
      label: `${LANGUAGES[c].label} (${LANGUAGES[c].native})`,
      text: getSetting(`recording.notice.${c}` as "recording.notice.en") || getSetting("recording.notice.en"),
      ui: { title: t(c, "consent.title"), lead: t(c, "consent.lead"), question: t(c, "consent.question"), grant: t(c, "consent.grant"), decline: t(c, "consent.decline") },
    }));
  return (
    <div className="space-y-4">
      {cur?.decision === "granted" ? (
        <Notice tone="green" title={tr("Consent granted")}>
          {tr("Recorded {date} with notice version {version}. You can start recording.", { date: formatDate(cur.created_at, { time: true, lang: uiLang }), version: cur.notice_version })}
        </Notice>
      ) : cur?.decision === "declined" ? (
        <Notice tone="slate" title={tr("Recording declined")}>
          <span lang={s.language}>{t(s.language, "consent.declined_note")}</span>
        </Notice>
      ) : cur?.decision === "withdrawn" ? (
        <Notice tone="amber" title={tr("Consent withdrawn")}>{tr("Recording stopped. Continue with typed or staff-assisted entry.")}</Notice>
      ) : null}

      {canEdit && cur?.decision !== "granted" && (
        <Card title={cur ? "Ask again" : "Explain and ask for consent"} description={cur ? "Only ask again if the person requests to be recorded. Each decision is logged." : "Recording starts only after consent is recorded here."}>
          <ConsentPanel action={consentAction} statementId={s.id} scope={scope} notices={notices} defaultLanguage={s.language} noticeVersion={getSetting("recording.notice_version")} />
        </Card>
      )}
      {!can(user, "recording.create") && <Notice tone="amber">{tr("Your role cannot make recordings.")}</Notice>}
      <ConsentHistory s={s} />
      {cur && <NextLink id={s.id} step="capture" label={cur.decision === "granted" ? tr("Continue to recording") : tr("Continue with written statement")} />}
    </div>
  );
}

async function RecordingsList({ user, s }: { user: AuthUser; s: StatementRow }) {
  const tr = await getTr();
  const uiLang = await getLang();
  const recs = listRecordings(s.id);
  if (recs.length === 0) return null;
  const urls = new Map(playable(user, s, tr, uiLang).map((p) => [p.id, p.url]));
  return (
    <Card title={tr("Saved recordings")} description={tr("Originals are kept separately from transcripts and are never edited.")}>
      <ul className="space-y-3">
        {recs.map((r, i) => (
          <li key={r.id} className="rounded border border-slate-200 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
              {r.kind === "video" ? <Video className="h-4 w-4 text-slate-500" aria-hidden /> : <Mic className="h-4 w-4 text-slate-500" aria-hidden />}
              <span className="font-medium">{tr("Recording {n}", { n: i + 1 })}</span>
              <span className="text-slate-500">{formatDuration(r.duration_ms)} · {formatBytes(r.size_bytes)} · {r.created_by_name} · {formatDate(r.created_at, { time: true, lang: uiLang })}</span>
              {r.status === "deleted" && <Badge tone="slate">{tr("Deleted under retention policy")}</Badge>}
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">SHA-256 {r.sha256.slice(0, 16)}…</p>
            {r.status === "stored" && urls.get(r.id) && (r.kind === "video" ? <video src={urls.get(r.id)} controls preload="metadata" className="mt-2 max-h-64 rounded bg-slate-900" /> : <audio src={urls.get(r.id)} controls preload="metadata" className="mt-2 w-full max-w-md" />)}
            {r.status === "stored" && !urls.get(r.id) && <p className="mt-1 text-xs text-slate-500">{tr("Your role cannot play recordings.")}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function CaptureStep({ user, s, canEdit }: { user: AuthUser; s: StatementRow; canEdit: boolean }) {
  const tr = await getTr();
  const uiLang = await getLang();
  const transcripts = listTranscripts(s.id);
  const latest = transcripts[transcripts.length - 1];
  const recorded = s.capture_method === "audio" || s.capture_method === "video";
  const scope = s.capture_method === "video" ? "video" : "audio";
  const consent = recorded ? currentConsent(s.id, scope) : undefined;
  const canRecordNow = recorded && consent?.decision === "granted" && can(user, "recording.create") && canEdit;
  const recs = playable(user, s, tr, uiLang);
  const anyRecordings = listRecordings(s.id).length > 0;

  if (!s.capture_method) {
    return <Notice tone="amber">{tr("Choose a capture method first.")} <Link href={`/intake/${s.id}?step=method`} className="underline">{tr("Go to capture method")}</Link></Notice>;
  }

  const source = recorded && anyRecordings ? "manual_transcription" : s.capture_method === "typed" ? "typed_original" : "assisted_entry";
  const instructions = s.capture_method === "typed" ? t(s.language, "capture.typed_instructions") : !recorded || !consent || consent.decision !== "granted" ? t(s.language, "capture.assisted_instructions") : undefined;

  return (
    <div className="space-y-4">
      {recorded && consent?.decision !== "granted" && (
        <Notice tone="slate" title={tr("No active recording consent")}>
          {tr("Recording is not permitted. Take the statement in writing or with staff help below — the report is accepted either way.")}
          {canEdit && <> {tr("Consent can be revisited on the")} <Link className="underline" href={`/intake/${s.id}?step=consent`}>{tr("consent step")}</Link> {tr("if the person asks.")}</>}
        </Notice>
      )}
      {canRecordNow && (
        <Card title={s.capture_method === "video" ? tr("Video recording") : tr("Audio recording")} description={tr("Consent granted {date}. Recording files are encrypted at rest when storage encryption is configured.", { date: formatDate(consent!.created_at, { time: true, lang: uiLang }) })}>
          <Recorder
            statementId={s.id}
            kind={scope}
            maxBytes={config.maxRecordingBytes}
            withdrawConsent={withdrawConsentAction}
            withdrawLabel={t(s.language, "consent.withdraw")}
            instructions={t(s.language, scope === "video" ? "capture.video_instructions" : "capture.audio_instructions")}
            lang={s.language}
          />
        </Card>
      )}
      <RecordingsList user={user} s={s} />

      {latest ? (
        <Card title={tr("Statement saved")} description={`${tr("Transcript version {n}", { n: latest.version })} · ${trDyn(tr, TRANSCRIPT_SOURCE_LABELS[latest.source])} · ${formatDate(latest.created_at, { time: true, lang: uiLang })}`}>
          <p lang={s.language} className="line-clamp-6 whitespace-pre-wrap text-[15px] text-slate-800">{latest.text}</p>
          <p className="mt-3 text-xs text-slate-500">{tr("Corrections are made on the next step and saved as new versions; the original is kept.")}</p>
          <NextLink id={s.id} step="transcript" label={tr("Continue to transcript review")} />
        </Card>
      ) : canEdit ? (
        <Card
          title={source === "manual_transcription" ? tr("Transcribe the recording") : s.capture_method === "typed" ? tr("Typed statement") : tr("Staff-assisted entry")}
          description={source === "manual_transcription" ? tr("No automatic transcription provider is configured for this deployment. Staff transcribe the recording manually.") : tr("Record the account in the speaker's own words. Do not summarize or tidy it.")}
        >
          {recorded && anyRecordings && recs.length === 0 && <Notice tone="amber" className="mb-3">{tr("Your role cannot play recordings. Ask an officer with recording access to transcribe it, or enter the account with staff assistance.")}</Notice>}
          {recorded && !anyRecordings && consent?.decision === "granted" && <Notice tone="slate" className="mb-3">{tr("Save a recording above first, or type the statement directly if recording is not possible.")}</Notice>}
          <TranscriptEditor
            action={saveTranscriptAction}
            statementId={s.id}
            source={source}
            initialText=""
            recordings={source === "manual_transcription" ? recs : []}
            lang={s.language}
            next="transcript"
            submitLabel={tr("Save statement and continue")}
            placeholder={s.language === "hi" ? "बयान यहाँ लिखें…" : "Type the account here, in the speaker's words…"}
            showNote
            instructions={instructions}
          />
        </Card>
      ) : (
        <Notice tone="slate">{tr("No statement has been entered yet.")}</Notice>
      )}
    </div>
  );
}

async function TranscriptStep({ user, s, canEdit }: { user: AuthUser; s: StatementRow; canEdit: boolean }) {
  const tr = await getTr();
  const uiLang = await getLang();
  const transcripts = listTranscripts(s.id);
  const latest = transcripts[transcripts.length - 1];
  if (!latest) return <Notice tone="amber">{tr("No statement text yet.")} <Link className="underline" href={`/intake/${s.id}?step=capture`}>{tr("Go back to the statement step")}</Link>.</Notice>;
  const provider = getAIProvider();
  const questions =
    provider.info.mode === "demo"
      ? await demoProvider.questions({ transcript: latest.text, transcriptVersion: latest.version, language: s.language, template: getActiveTemplate().fields, intake: { speakerName: s.speaker_name, incidentType: s.incident_type, incidentDate: s.incident_date, incidentLocation: s.incident_location } })
      : [];
  const recs = playable(user, s, tr, uiLang);
  return (
    <div className="space-y-4">
      <Notice tone="amber" title={tr("Transcription uncertainty")}>
        {latest.source === "automatic_transcription"
          ? tr("This transcript was produced automatically and may contain errors.")
          : tr("This transcript was written by staff and may contain errors or omissions.")}{" "}
        {tr("Review it with the speaker before confirming.")} {latest.uncertainty_note && <span className="block">{tr("Noted uncertainty:")} {latest.uncertainty_note}</span>}
      </Notice>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={tr("Current transcript — version {n}", { n: latest.version })} description={`${trDyn(tr, TRANSCRIPT_SOURCE_LABELS[latest.source])} · ${latest.created_by_name} · ${formatDate(latest.created_at, { time: true, lang: uiLang })}`}>
          <div lang={s.language} className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{latest.text}</div>
          {latest.segments.length > 0 && <p className="mt-2 text-xs text-slate-500">{tr("{n} passage(s) linked to recording timestamps.", { n: latest.segments.length })}</p>}
          {transcripts.length > 1 && <p className="mt-2 text-xs"><Link href={`/statements/${s.id}#transcripts`} className="text-[#1B6650] hover:underline">{tr("Compare all {n} versions", { n: transcripts.length })}</Link></p>}
        </Card>
        <section lang={s.language} aria-labelledby="readback-title" className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 id="readback-title" className="text-sm font-semibold text-blue-950">{t(s.language, "readback.title")}</h3>
          <p className="mt-1 text-sm text-blue-950">{t(s.language, "readback.lead")}</p>
          <p className="mt-2 text-sm text-blue-900">{t(s.language, "readback.uncertainty")}</p>
          {provider.info.mode === "demo" && questions.length > 0 && (
            <div lang="en" className="mt-4 rounded border border-blue-200 bg-white p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Bot className="h-3.5 w-3.5" aria-hidden /> {tr("Assistant: details that may need confirming")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-700">{questions.map((q, i) => <li key={i}>{q.question}</li>)}</ul>
              <p className="mt-1 text-[11px] text-slate-500">{tr("Generated by fixed rules. Ask neutral, open questions; do not lead the speaker.")}</p>
            </div>
          )}
          {provider.info.mode === "live" && <p lang="en" className="mt-3 text-xs text-blue-900">{tr("Missing-detail questions are listed when the draft is generated.")}</p>}
        </section>
      </div>

      {s.transcript_confirmed_at ? (
        <Notice tone="green" title={tr("Transcript confirmed")}>{tr("Confirmed {date}. Any further correction will require confirming again.", { date: formatDate(s.transcript_confirmed_at, { time: true, lang: uiLang }) })}</Notice>
      ) : canEdit ? (
        <Card title={tr("Confirm transcript")}>
          <ActionForm action={confirmTranscriptAction} className="space-y-3">
            <input type="hidden" name="statementId" value={s.id} />
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" name="readBack" className="mt-0.5" />
              <span><span lang={s.language}>{t(s.language, "readback.confirm_prompt")}</span>{s.language !== "en" && <span className="block text-xs text-slate-500">{t("en", "readback.confirm_prompt")}</span>}</span>
            </label>
            <SubmitButton>{tr("Confirm transcript version {n}", { n: latest.version })}</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}

      {canEdit && (
        <details className="rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">{tr("Correct the transcript (saves a new version)")}</summary>
          <div className="mt-3">
            <TranscriptEditor action={saveTranscriptAction} statementId={s.id} source="correction" initialText={latest.text} recordings={recs} lang={s.language} submitLabel={tr("Save correction as new version")} showNote />
          </div>
        </details>
      )}
      {s.transcript_confirmed_at && <NextLink id={s.id} step="draft" />}
    </div>
  );
}

async function DraftStep({ user, s, canEdit }: { user: AuthUser; s: StatementRow; canEdit: boolean }) {
  const tr = await getTr();
  const uiLang = await getLang();
  const provider = getAIProvider().info;
  const note = aiStatusNote();
  const draft = listDraftsForStatement(s.id)[0];
  const versions = draft ? listVersions(draft.id) : [];
  const cur = versions[versions.length - 1];
  const canGenerate = can(user, "draft.generate") && s.status !== "abandoned" && !!s.transcript_confirmed_at;
  const fields = cur ? Object.values(cur.fields) : [];
  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-1.5"><Bot className="h-4 w-4 text-slate-500" aria-hidden /> {tr("Draft assistant")}</span>}>
        <KeyValue items={[
          { label: tr("Assistant"), value: provider.label },
          { label: tr("Mode"), value: provider.mode === "live" ? <Badge tone="blue">{tr("Live AI")}</Badge> : <Badge tone="amber">{tr("Rule-based assistant (not AI)")}</Badge> },
          { label: tr("Template"), value: getActiveTemplate().name },
          { label: tr("Legal provisions"), value: tr("Not drafted by the assistant — rule-based suggestions on the statement page; an officer decides") },
        ]} />
        {note && <p className="mt-3 text-xs text-slate-600">{note}</p>}
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
          <li>{tr("The assistant only organizes what the speaker said; every filled field links to source text.")}</li>
          <li>{tr("Unknown details are marked “Not provided” or “Needs confirmation”.")}</li>
          <li>{tr("It never files an FIR, classifies offences, or assesses credibility, guilt or risk.")}</li>
        </ul>
      </Card>

      {!s.transcript_confirmed_at && <Notice tone="amber">{tr("Confirm the transcript with the speaker before preparing a draft.")} <Link href={`/intake/${s.id}?step=transcript`} className="underline">{tr("Go to transcript")}</Link></Notice>}

      {draft && cur ? (
        <Card title={tr("Current draft")} actions={<DraftStatusBadge status={draft.status} />}>
          <p className="text-sm text-slate-700">
            {tr("Version {n}", { n: cur.version })} · {cur.origin === "ai" ? tr("AI-generated") : cur.origin === "demo" ? tr("Rule-based draft") : tr("Edited by staff")} · {formatDate(cur.created_at, { time: true, lang: uiLang })}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {tr("{a} provided · {b} need confirmation · {c} not provided", { a: fields.filter((f) => f.status === "provided").length, b: fields.filter((f) => f.status === "needs_confirmation").length, c: fields.filter((f) => f.status === "not_provided").length })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/intake/${s.id}?step=review`} variant="primary">{tr("Open review")}</ButtonLink>
            {canGenerate && (
              <ActionForm action={generateDraftAction} confirmTitle={tr("Regenerate the draft?")} confirmLabel={tr("Regenerate")} confirm={<>{tr("A new version is generated from the latest transcript. Staff edits in the current version are not carried over, but all earlier versions remain in the history.")}{provider.mode === "live" && ` ${tr("The statement text will be sent to the configured AI provider.")}`}</>}>
                <input type="hidden" name="statementId" value={s.id} />
                <SubmitButton variant="secondary" pendingLabel={tr("Generating…")}>{tr("Regenerate")}</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Card>
      ) : canGenerate ? (
        <Card title={tr("Prepare draft")}>
          <ActionForm
            action={generateDraftAction}
            confirm={provider.mode === "live" ? <>{tr("The confirmed transcript will be sent to {provider} for drafting. This deployment is configured as authorized for external processing.", { provider: provider.label })}</> : undefined}
            confirmTitle={tr("Send statement to AI provider?")}
            confirmLabel={tr("Generate draft")}
          >
            <input type="hidden" name="statementId" value={s.id} />
            <p className="mb-3 text-sm text-slate-600">{provider.mode === "live" ? tr("The draft will be labelled as AI-generated and must be reviewed field by field.") : tr("The draft will be labelled as a rule-based assistant draft and must be reviewed field by field.")}</p>
            <SubmitButton pendingLabel={tr("Generating…")}>{tr("Generate draft")}</SubmitButton>
          </ActionForm>
        </Card>
      ) : !can(user, "draft.generate") ? (
        <Notice tone="slate">{tr("Your role cannot generate drafts.")}</Notice>
      ) : null}
      {draft && <NextLink id={s.id} step="review" label={tr("Continue to review")} />}
      {!draft && canEdit && s.transcript_confirmed_at && (
        <p className="text-right text-xs text-slate-500">
          {tr("A draft is optional for creating a case.")} <Link href={`/intake/${s.id}?step=case`} className="text-[#1B6650] hover:underline">{tr("Skip to case creation")}</Link>
        </p>
      )}
    </div>
  );
}

async function ReviewStep({ user, s, version }: { user: AuthUser; s: StatementRow; version?: number }) {
  const tr = await getTr();
  const draft = listDraftsForStatement(s.id)[0];
  if (!draft) return <Notice tone="amber">{tr("No draft has been prepared.")} <Link className="underline" href={`/intake/${s.id}?step=draft`}>{tr("Prepare a draft")}</Link> {tr("or")} <Link className="underline" href={`/intake/${s.id}?step=case`}>{tr("continue to case creation")}</Link>.</Notice>;
  return (
    <>
      <ReviewWorkspace user={user} draft={draft} statement={s} versionParam={version} hrefForVersion={(v) => `/intake/${s.id}?step=review&v=${v}`} />
      {s.status === "in_progress" && <NextLink id={s.id} step="case" label={tr("Continue to case creation")} />}
      {s.status === "completed" && <NextLink id={s.id} step="complete" label={tr("Back to summary")} />}
    </>
  );
}

async function CaseStep({ user, s }: { user: AuthUser; s: StatementRow }) {
  const tr = await getTr();
  if (!can(user, "case.create")) return <Notice tone="slate">{tr("Your role cannot create cases. Ask an officer or administrator to complete this step.")}</Notice>;
  if (!hasTranscript(s)) return <Notice tone="amber">{tr("Record or enter the statement before creating a case.")}</Notice>;
  const wf = localizeWorkflow(getWorkflow("case"), tr);
  const draft = listDraftsForStatement(s.id)[0];
  const duplicates = findPossibleDuplicates(user, {
    stationId: s.station_id,
    incidentType: s.incident_type,
    incidentDate: s.incident_date,
    names: s.speaker_name ? [s.speaker_name] : [],
    phones: s.speaker_contact ? [s.speaker_contact] : [],
  });
  return (
    <div className="space-y-4">
      {draft && draft.status !== "reviewed" && (
        <Notice tone="amber" title={tr("The draft has not been reviewed")}>{tr("You can still create the case; it will start at an earlier stage and the draft review remains outstanding.")}</Notice>
      )}
      {!draft && <Notice tone="slate">{tr("No draft was prepared. The case will start at statement review.")}</Notice>}
      <Card>
        <CaseForm
          action={createCaseAction}
          statementId={s.id}
          defaults={{ title: s.incident_type ? `${s.incident_type} reported${s.incident_location ? ` — ${s.incident_location}` : ""}` : "", incidentType: s.incident_type ?? "" }}
          incidentTypes={getSetting("incident.types")}
          assignees={assignableUsers(s.station_id)}
          canAssignOthers={can(user, "case.assign")}
          currentUserId={user.id}
          duplicates={duplicates}
          initialStatusLabel={stateLabel(wf, initialCaseStatus(s.id))}
        />
      </Card>
    </div>
  );
}

function hasTranscript(s: StatementRow) {
  return listTranscripts(s.id).length > 0;
}

async function CompleteStep({ user, s }: { user: AuthUser; s: StatementRow }) {
  const tr = await getTr();
  const uiLang = await getLang();
  if (!s.case_id) return null;
  const c = getCaseSummary(s.case_id);
  if (!c) return <Notice tone="slate">{tr("Case created. You may not have access to view it.")}</Notice>;
  const wf = localizeWorkflow(getWorkflow("case"), tr);
  const official = OFFICIAL_STATUS_LABELS[c.official_status] ?? OFFICIAL_STATUS_LABELS.local;
  const canSee = can(user, "case.view.all") || can(user, "case.view.station") || can(user, "case.view.assigned");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
        <p className="flex items-center gap-2 text-base font-semibold text-emerald-900"><CheckCircle2 className="h-5 w-5" aria-hidden /> {tr("Case {ref} created", { ref: c.reference })}</p>
        <KeyValue items={[
          { label: tr("Reference"), value: <span className="font-mono">{c.reference}</span> },
          { label: tr("Workflow stage"), value: trDyn(tr, stateLabel(wf, c.status)) },
          { label: tr("Official status"), value: trDyn(tr, official.label) },
          { label: tr("Created"), value: formatDate(c.created_at, { time: true, lang: uiLang }) },
        ]} />
      </div>
      <Notice tone="amber" title={<span className="flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" aria-hidden /> {tr("Local record only — not submitted to or filed with any official system")}</span>}>
        {trDyn(tr, official.description)} {tr("FirstRecord has no official filing integration configured. Registering an FIR must be done through the authorized official process.")}
      </Notice>
      <Card title={tr("Next steps")}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>{tr("Statement, consent record, transcript versions and drafts are linked to the case.")}</li>
          <li>{tr("Complete any outstanding draft review and follow-up tasks in the case workspace.")}</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {canSee && <ButtonLink href={`/cases/${c.id}`} variant="primary">{tr("Open case")}</ButtonLink>}
          <ButtonLink href={`/statements/${s.id}`}>{tr("Statement record")}</ButtonLink>
          <ButtonLink href="/intake/new">{tr("Start another report")}</ButtonLink>
        </div>
      </Card>
    </div>
  );
}

function getCaseSummary(caseId: string) {
  return dbGet<{ id: string; reference: string; status: string; official_status: string; created_at: string }>(
    "SELECT id, reference, status, official_status, created_at FROM cases WHERE id = ?",
    caseId,
  );
}
