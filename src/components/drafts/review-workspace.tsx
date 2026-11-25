/**
 * Step G review workspace (server component). Side-by-side source statement and
 * draft fields, suggestion decisions, field comments, version history with diffs,
 * and review actions. Shared by the intake wizard and /statements/[id]/review.
 */
import Link from "next/link";
import { Bot, FileWarning, History, Info, Quote, Scale } from "lucide-react";
import { Badge, Card, Notice, cx, type Tone } from "@/components/ui";
import { can, type AuthUser } from "@/lib/rbac/access";
import { formatDate, DRAFT_STATUS_LABELS } from "@/lib/format";
import { getTr, getLang } from "@/lib/i18n/server";
import { trDyn } from "@/lib/i18n/dynamic";
import type { Tr } from "@/lib/i18n/messages";
import type { DraftField, FieldStatus } from "@/lib/ai/types";
import {
  getTemplate,
  listComments,
  listReviews,
  listVersions,
  reviewReadiness,
  type DraftRow,
} from "@/lib/domain/drafts";
import { listTranscripts, type StatementRow } from "@/lib/domain/statements";
import { SourceText, DiffView, mergedRanges, sourceAnchor } from "./source-text";
import { diffWords, fieldText } from "./diff";
import {
  AcceptAllPending,
  ClarificationForm,
  CommentToggle,
  FieldDecision,
  FieldEditor,
  MarkReviewedForm,
  RequestReviewButton,
  ResolveComment,
} from "./review-controls";

const STATUS: Record<FieldStatus, { label: string; tone: Tone }> = {
  provided: { label: "Provided", tone: "green" },
  not_provided: { label: "Not provided", tone: "slate" },
  needs_confirmation: { label: "Needs confirmation", tone: "amber" },
};

export async function DraftStatusBadge({ status }: { status: DraftRow["status"] }) {
  const tr = await getTr();
  const tone: Tone = status === "reviewed" ? "green" : status === "clarification_requested" ? "amber" : "blue";
  return <Badge tone={tone}>{trDyn(tr, DRAFT_STATUS_LABELS[status])}</Badge>;
}

function originBadge(f: DraftField, tr: Tr) {
  if (f.origin === "ai") return <Badge tone="blue"><Bot className="h-3 w-3" aria-hidden /> {tr("AI suggestion")}</Badge>;
  if (f.origin === "demo") return <Badge tone="blue"><Bot className="h-3 w-3" aria-hidden /> {tr("Assistant suggestion")}</Badge>;
  return <Badge tone="slate">{tr("Staff-entered")}</Badge>;
}

function decisionBadge(f: DraftField, tr: Tr) {
  if (f.decision === "accepted") return <Badge tone="green">{tr("Accepted by reviewer")}</Badge>;
  if (f.decision === "rejected") return <Badge tone="slate">{tr("Suggestion rejected")}</Badge>;
  if (f.decision === "edited") return <Badge tone="blue">{tr("Edited by staff")}</Badge>;
  if (f.origin !== "human") return <Badge tone="amber">{tr("Awaiting decision")}</Badge>;
  return null;
}

export async function ReviewWorkspace({
  user,
  draft,
  statement,
  versionParam,
  hrefForVersion,
}: {
  user: AuthUser;
  draft: DraftRow;
  statement: StatementRow;
  versionParam?: number;
  hrefForVersion: (v: number) => string;
}) {
  const tr = await getTr();
  const uiLang = await getLang();
  const template = getTemplate(draft.template_id);
  const versions = listVersions(draft.id);
  const viewing = versions.find((v) => v.version === versionParam) ?? versions[versions.length - 1];
  if (!viewing) return <Notice tone="amber">{tr("This draft has no versions yet.")}</Notice>;
  const isCurrent = viewing.version === draft.current_version;
  const prev = versions.find((v) => v.version === viewing.version - 1);
  const lastGenerated = [...versions].reverse().find((v) => v.origin !== "human");
  const transcripts = listTranscripts(statement.id);
  const sourceTv = transcripts.find((t) => t.version === viewing.based_on_transcript_version) ?? transcripts[transcripts.length - 1];
  const allSources = Object.values(viewing.fields).flatMap((f) => f.sources);
  const ranges = sourceTv ? mergedRanges(sourceTv.text, allSources, sourceTv.version) : [];
  const comments = listComments(draft.id);
  const reviews = listReviews(draft.id);
  const readiness = reviewReadiness(draft);
  const editable = isCurrent && can(user, "draft.edit") && statement.status !== "abandoned";
  const canReview = can(user, "draft.review") && isCurrent && statement.status !== "abandoned";
  const lang = statement.language;

  const disabledReason = readiness.missingRequired.length
    ? tr("Complete required fields first: {fields}.", { fields: readiness.missingRequired.map((x) => trDyn(tr, x)).join(", ") })
    : readiness.pendingSuggestions.length
      ? tr("Accept, edit or reject every suggestion first ({n} remaining).", { n: readiness.pendingSuggestions.length })
      : draft.status === "reviewed" && draft.reviewed_version === draft.current_version
        ? tr("This version is already marked reviewed.")
        : null;

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div className={cx("rounded-lg border p-4", draft.status === "reviewed" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{tr("Draft")}</span>
          <DraftStatusBadge status={draft.status} />
          <Badge tone="slate">{tr("Version {n}", { n: draft.current_version })}</Badge>
          <Badge tone="slate">{tr("Not filed — local record only")}</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          {draft.status === "reviewed" ? (
            <>
              {tr("Version {n} was marked reviewed by {name} on {date}.", { n: draft.reviewed_version ?? "—", name: draft.reviewed_by_name ?? tr("an officer"), date: formatDate(draft.reviewed_at, { time: true, lang: uiLang }) })}
              {draft.reviewed_version !== draft.current_version && ` ${tr("The draft has changed since then.")}`} {tr("Reviewed does not mean filed: no official FIR has been registered by FirstRecord.")}
            </>
          ) : (
            <>{tr("This document is a draft prepared for human review. It must be checked against the source statement by an authorized officer before any official use.")}</>
          )}
        </p>
        {lastGenerated && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <Bot className="h-3.5 w-3.5" aria-hidden />
            {lastGenerated.origin === "ai" ? tr("AI-generated draft") : tr("Rule-based assistant draft (not AI)")} · {lastGenerated.provider}/{lastGenerated.model} · {tr("generated {date} (version {n}) from transcript v{t}", { date: formatDate(lastGenerated.created_at, { time: true, lang: uiLang }), n: lastGenerated.version, t: lastGenerated.based_on_transcript_version ?? "—" })}
          </p>
        )}
      </div>

      {!isCurrent && (
        <Notice tone="amber" title={tr("Viewing historical version {n}", { n: viewing.version })}>
          {tr("This version is read-only.")} <Link className="font-medium underline" href={hrefForVersion(draft.current_version)}>{tr("Go to the current version ({n})", { n: draft.current_version })}</Link>.
        </Notice>
      )}
      {readiness.transcriptChanged && (
        <Notice tone="amber" title={tr("The transcript changed after this draft was generated")}>
          {tr("Draft is based on transcript v{from}; the latest is v{to}. Check the draft against the latest transcript or regenerate it.", { from: readiness.transcriptChanged.from, to: readiness.transcriptChanged.to })}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Source */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card
            title={<span className="flex items-center gap-1.5"><Quote className="h-4 w-4 text-slate-500" aria-hidden /> {tr("Source statement")}</span>}
            description={sourceTv ? tr("Transcript version {n} · highlighted text is cited by the draft", { n: sourceTv.version }) : undefined}
          >
            {sourceTv ? (
              <div className="max-h-[70vh] overflow-y-auto pr-1">
                <SourceText text={sourceTv.text} sources={allSources} version={sourceTv.version} lang={lang} />
              </div>
            ) : (
              <p className="text-sm text-slate-600">{tr("No transcript available.")}</p>
            )}
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <Link href={`/statements/${statement.id}`} className="text-[#1F4E9C] hover:underline">{tr("Open full statement record")}</Link> {tr("for recordings and all transcript versions.")}
            </p>
          </Card>
        </div>

        {/* Draft fields */}
        <div className="space-y-3">
          {viewing.questions.length > 0 && (
            <Card title={<span className="flex items-center gap-1.5"><Info className="h-4 w-4 text-slate-500" aria-hidden /> {tr("Questions to confirm with the speaker")}</span>}>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {viewing.questions.map((q, i) => <li key={i}>{q.question}</li>)}
              </ul>
            </Card>
          )}
          {editable && readiness.pendingSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-sm text-slate-700">{tr("{n} suggestion(s) awaiting a decision.", { n: readiness.pendingSuggestions.length })}</p>
              <AcceptAllPending draftId={draft.id} count={readiness.pendingSuggestions.length} />
            </div>
          )}

          {template.fields.map((tf) => {
            const f = viewing.fields[tf.key];
            const fieldComments = comments.filter((c) => c.field_key === tf.key);
            const prevF = prev?.fields[tf.key];
            const changed = prev && fieldText(prevF?.value) !== fieldText(f?.value);
            const isVerbatim = tf.key === "verbatim_extracts";
            const isGenerated = tf.key === "account_summary";
            return (
              <section key={tf.key} aria-labelledby={`fld-${tf.key}`} className={cx("rounded-lg border bg-white p-4", f && f.origin !== "human" && !f.decision ? "border-blue-200" : "border-slate-200")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 id={`fld-${tf.key}`} className="text-sm font-semibold text-slate-900">
                      {trDyn(tr, tf.label)}
                      {tf.required && <span className="ml-1 text-xs font-normal text-red-700">{tr("required")}</span>}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f && <Badge tone={STATUS[f.status].tone}>{trDyn(tr, STATUS[f.status].label)}</Badge>}
                      {f && originBadge(f, tr)}
                      {f && decisionBadge(f, tr)}
                      {isVerbatim && <Badge tone="slate"><Quote className="h-3 w-3" aria-hidden /> {tr("Verbatim")}</Badge>}
                      {isGenerated && <Badge tone="blue">{tr("Generated text — check against source")}</Badge>}
                      {changed && <Badge tone="blue">{tr("Changed in v{n}", { n: viewing.version })}</Badge>}
                    </div>
                  </div>
                  {editable && f && (
                    <div className="flex flex-wrap items-center gap-1">
                      {f.origin !== "human" && !f.decision && <FieldDecision draftId={draft.id} fieldKey={tf.key} label={tf.label} />}
                    </div>
                  )}
                </div>

                {tf.key === "legal_provisions" && (
                  <p className="mt-2 flex items-start gap-1.5 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                    <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {tr("The assistant does not decide legal provisions. Only provisions selected by an authorized officer belong in this field.")}
                  </p>
                )}

                <div lang={lang} className={cx("mt-3 text-sm text-slate-800", f && f.origin !== "human" && !f.decision && "rounded bg-blue-50/60 px-2 py-1.5")}>
                  {!f || (Array.isArray(f.value) ? f.value.length === 0 : !f.value) ? (
                    <span className="italic text-slate-500">{f?.status === "needs_confirmation" ? tr("Needs confirmation") : tr("Not provided")}</span>
                  ) : Array.isArray(f.value) ? (
                    <ul className="list-disc space-y-1 pl-5">{f.value.map((v, i) => <li key={i} className={isVerbatim ? "text-slate-800" : ""}>{v}</li>)}</ul>
                  ) : (
                    <p className={cx("whitespace-pre-wrap", isVerbatim && "border-l-2 border-slate-300 pl-3 text-slate-800")}>{f.value}</p>
                  )}
                </div>

                {f && f.sources.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">{tr("Sources ({n})", { n: f.sources.length })}</summary>
                    <ul className="mt-1.5 space-y-1">
                      {f.sources.map((s, i) => {
                        const href = sourceAnchor(ranges, s);
                        return (
                          <li key={i} className="text-xs text-slate-600">
                            {s.kind === "intake" ? (
                              <span>{tr("Intake record:")} {trDyn(tr, s.label)}</span>
                            ) : href ? (
                              <a href={href} className="hover:underline" lang={lang}>“{s.quote.length > 160 ? s.quote.slice(0, 160) + "…" : s.quote}”</a>
                            ) : (
                              <span lang={lang}>“{s.quote.slice(0, 160)}” <span className="text-amber-700">({tr("transcript v{n}", { n: s.transcriptVersion })})</span></span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
                {f?.rationale && <p className="mt-1 text-xs text-slate-500">{f.rationale}</p>}

                {changed && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-[#1F4E9C]">{tr("Show change from v{n}", { n: prev!.version })}</summary>
                    <div className="mt-1.5 rounded border border-slate-200 bg-slate-50 p-2">
                      <DiffView parts={diffWords(fieldText(prevF?.value), fieldText(f?.value))} lang={lang} />
                    </div>
                  </details>
                )}

                {fieldComments.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                    {fieldComments.map((c) => (
                      <li key={c.id} className={cx("flex items-start justify-between gap-2 rounded px-2 py-1.5 text-xs", c.resolved_at ? "bg-slate-50 text-slate-500" : "bg-amber-50 text-slate-800")}>
                        <span>
                          <span className="font-medium">{c.author_name}</span> · v{c.draft_version} · {formatDate(c.created_at, { time: true, lang: uiLang })}
                          {c.resolved_at && ` · ${tr("resolved")}`}
                          <span className="mt-0.5 block whitespace-pre-wrap">{c.body}</span>
                        </span>
                        {!c.resolved_at && (can(user, "draft.edit") || can(user, "draft.review")) && <ResolveComment draftId={draft.id} commentId={c.id} />}
                      </li>
                    ))}
                  </ul>
                )}

                {isCurrent && (can(user, "draft.edit") || can(user, "draft.review")) && statement.status !== "abandoned" && (
                  <div className="mt-2 flex flex-wrap items-start gap-1">
                    {editable && <FieldEditor draftId={draft.id} fieldKey={tf.key} label={tf.label} kind={tf.kind} value={f && !["Not provided", "Needs confirmation"].includes(fieldText(f.value)) ? fieldText(f.value) : ""} lang={lang} />}
                    <CommentToggle draftId={draft.id} fieldKey={tf.key} label={tf.label} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* Review actions */}
      <Card title={tr("Review")} description={tr("Saving, clarification and review are recorded in the audit history.")}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <h3 className="font-semibold text-slate-900">{tr("Readiness")}</h3>
            <ul className="space-y-1">
              <li>{readiness.missingRequired.length ? <span className="text-red-700">{tr("Missing required:")} {readiness.missingRequired.map((x) => trDyn(tr, x)).join(", ")}</span> : <span className="text-emerald-700">{tr("All required fields completed")}</span>}</li>
              <li>{readiness.pendingSuggestions.length ? <span className="text-amber-800">{tr("Suggestions awaiting decision:")} {readiness.pendingSuggestions.length}</span> : <span className="text-emerald-700">{tr("No pending suggestions")}</span>}</li>
              <li>{readiness.needsConfirmation.length ? <span className="text-amber-800">{tr("Needs confirmation:")} {readiness.needsConfirmation.map((x) => trDyn(tr, x)).join(", ")}</span> : <span className="text-emerald-700">{tr("Nothing marked “Needs confirmation”")}</span>}</li>
              <li className="text-slate-600">{tr("Open comments:")} {readiness.openComments}</li>
            </ul>
            {editable && draft.status !== "reviewed" && (
              <div className="flex flex-wrap gap-2 pt-2">
                <RequestReviewButton draftId={draft.id} />
              </div>
            )}
          </div>
          <div className="space-y-3">
            {canReview ? (
              <>
                <MarkReviewedForm draftId={draft.id} version={draft.current_version} needsConfirmation={readiness.needsConfirmation} disabledReason={disabledReason} />
                <div className="border-t border-slate-100 pt-3">
                  <ClarificationForm draftId={draft.id} />
                </div>
              </>
            ) : (
              <Notice tone="slate">
                {can(user, "draft.review")
                  ? tr("Review actions are available on the current version only.")
                  : tr("Your role cannot mark drafts reviewed. Use “Request review” to notify an authorized officer.")}
              </Notice>
            )}
          </div>
        </div>
      </Card>

      {/* Reviews + history */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={tr("Review decisions")}>
          {reviews.length === 0 ? (
            <p className="text-sm text-slate-600">{tr("No review decisions yet.")}</p>
          ) : (
            <ul className="space-y-2">
              {reviews.map((r) => (
                <li key={r.id} className="text-sm">
                  <Badge tone={r.decision === "reviewed" ? "green" : "amber"}>{r.decision === "reviewed" ? tr("Marked reviewed") : tr("Clarification requested")}</Badge>{" "}
                  <span className="text-slate-700">{tr("v{n} by {name}", { n: r.draft_version, name: r.reviewer_name })} · {formatDate(r.created_at, { time: true, lang: uiLang })}</span>
                  {r.comment && <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-1.5"><History className="h-4 w-4 text-slate-500" aria-hidden /> {tr("Version history")}</span>} description={tr("Versions are immutable. Select one to view it.")}>
          <ol className="space-y-1.5">
            {[...versions].reverse().map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <Link href={hrefForVersion(v.version)} aria-current={v.version === viewing.version ? "true" : undefined} className={cx("font-medium hover:underline", v.version === viewing.version ? "text-slate-900" : "text-[#1F4E9C]")}>
                  v{v.version}
                </Link>
                <Badge tone={v.origin === "human" ? "slate" : "blue"}>{v.origin === "ai" ? tr("AI") : v.origin === "demo" ? tr("Assistant") : tr("Staff")}</Badge>
                <span className="text-slate-700">{v.change_summary}</span>
                <span className="text-xs text-slate-500">{v.created_by_name} · {formatDate(v.created_at, { time: true, lang: uiLang })}</span>
                {draft.reviewed_version === v.version && <Badge tone="green">{tr("Reviewed")}</Badge>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
      {statement.status === "abandoned" && (
        <Notice tone="red" title={tr("Report abandoned")}><FileWarning className="inline h-4 w-4" aria-hidden /> {tr("This report was abandoned; the draft is read-only.")}</Notice>
      )}
    </div>
  );
}
