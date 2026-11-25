"use client";
import { useT } from "@/lib/i18n/client";
import { useCallback, useDeferredValue, useRef, useState } from "react";
import { Clock, Play } from "lucide-react";
import { ActionForm, SubmitButton, useFieldError, type ActionResult } from "@/components/forms";
import { buttonClass, inputClass } from "@/components/ui";
import { formatTimestamp, formatRange, parseSegments } from "./timestamps";
import { AutoTranscribe, type AutoTranscriptResult } from "./auto-transcribe";

export interface PlayableRecording {
  id: string;
  url: string;
  kind: "audio" | "video";
  label: string;
}

export function TranscriptEditor({
  action,
  statementId,
  source,
  initialText,
  recordings = [],
  lang,
  next,
  submitLabel,
  placeholder,
  showNote,
  instructions,
}: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  statementId: string;
  source: "typed_original" | "manual_transcription" | "assisted_entry" | "correction";
  initialText: string;
  recordings?: PlayableRecording[];
  lang: string;
  next?: "transcript";
  submitLabel: string;
  placeholder?: string;
  showNote: boolean;
  instructions?: string;
}) {
  const tr = useT();
  const [recId, setRecId] = useState(recordings[recordings.length - 1]?.id ?? "");
  const rec = recordings.find((r) => r.id === recId);
  const media = useRef<HTMLMediaElement | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [chars, setChars] = useState(initialText.length);
  const [text, setText] = useState(initialText);
  const deferredText = useDeferredValue(text);
  const [auto, setAuto] = useState<AutoTranscriptResult | null>(null);
  const [pending, setPending] = useState<AutoTranscriptResult | null>(null);
  const canAuto = source === "manual_transcription" && !!rec;

  function setAreaText(v: string) {
    const ta = area.current;
    if (!ta) return;
    ta.value = v;
    setChars(v.length);
    setText(v);
  }

  const onAutoResult = useCallback((r: AutoTranscriptResult) => {
    const current = area.current?.value ?? "";
    // Fill automatically when the editor is empty or still holds the previous machine output.
    if (!current.trim() || (auto && current === auto.text)) {
      setAreaText(r.text);
      setAuto(r);
      setPending(null);
    } else {
      setPending(r);
    }
  }, [auto]);

  function seek(ms: number) {
    const m = media.current;
    if (!m) return;
    m.currentTime = ms / 1000;
    m.play().catch(() => {});
  }

  function insertTimestamp() {
    const ta = area.current;
    if (!ta) return;
    const ms = (media.current?.currentTime ?? 0) * 1000;
    const marker = `${ta.selectionStart > 0 && !/\s$/.test(ta.value.slice(0, ta.selectionStart)) ? "\n" : ""}[${formatTimestamp(ms)}] `;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    ta.value = value.slice(0, a) + marker + value.slice(b);
    ta.selectionStart = ta.selectionEnd = a + marker.length;
    ta.focus();
    setChars(ta.value.length);
    setText(ta.value);
  }

  const segments = rec ? parseSegments(deferredText, rec.id) : [];

  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="statementId" value={statementId} />
      <input type="hidden" name="source" value={source} />
      {next && <input type="hidden" name="next" value={next} />}
      {rec && <input type="hidden" name="recordingId" value={rec.id} />}
      {canAuto && auto && (
        <>
          <input type="hidden" name="autoText" value={auto.text} />
          <input type="hidden" name="autoModel" value={`${auto.model} (${auto.device})`} />
        </>
      )}
      {instructions && <p lang={lang} className="text-sm text-slate-700">{instructions}</p>}

      {recordings.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-3">
            {recordings.length > 1 && (
              <label className="text-sm text-slate-700">
                <span className="sr-only">{tr("Recording to transcribe")}</span>
                <select value={recId} onChange={(e) => setRecId(e.target.value)} className={`${inputClass} w-auto`}>
                  {recordings.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </label>
            )}
            {rec && (rec.kind === "video" ? (
              <video key={rec.id} ref={(el) => { media.current = el; }} src={rec.url} controls preload="metadata" className="max-h-56 rounded bg-slate-900" />
            ) : (
              <audio key={rec.id} ref={(el) => { media.current = el; }} src={rec.url} controls preload="metadata" className="w-full max-w-md" />
            ))}
            <button type="button" onClick={insertTimestamp} className={buttonClass("secondary", "sm")}>
              <Clock className="h-3.5 w-3.5" aria-hidden /> {tr("Insert timestamp")}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {canAuto
              ? "Each line starts with a [start - end] time range linking the text to the recording. Edit the words or the times directly; “Insert timestamp” adds a marker at the current playback position."
              : "Play the recording and type what is said, word for word. Use “Insert timestamp” to add a [mm:ss] marker linking the following text to that point in the recording."}
          </p>
        </div>
      )}

      {canAuto && rec && (
        <AutoTranscribe key={rec.id} recordingUrl={rec.url} language={lang} autoStart={!initialText.trim()} onResult={onAutoResult} />
      )}
      {pending && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{tr("A new automatic transcript is ready. The editor already contains text, so it was not replaced.")}</span>
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            onClick={() => {
              setAreaText(pending.text);
              setAuto(pending);
              setPending(null);
            }}
          >
            {tr("Replace text with new transcript")}
          </button>
        </div>
      )}

      <TextArea areaRef={area} initialText={initialText} lang={lang} placeholder={placeholder} onChange={(v) => { setChars(v.length); setText(v); }} />
      <p className="text-right text-xs text-slate-500" aria-live="polite">{chars.toLocaleString()} / 100,000 characters</p>

      {rec && segments.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white" open={canAuto}>
          <summary className="flex min-h-10 cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold text-navy-900 hover:bg-navy-50">
            Timestamped segments ({segments.length})
            <span className="text-xs font-normal text-slate-500">{tr("Select a time to play that part of the recording")}</span>
          </summary>
          <ol className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-t border-slate-200">
            {segments.map((sg, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => seek(sg.offsetMs)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-blue-800 hover:bg-blue-100"
                  aria-label={tr("Play from {time}", { time: formatTimestamp(sg.offsetMs) })}
                >
                  <Play className="h-3 w-3" aria-hidden /> {formatRange(sg.offsetMs, sg.endMs).slice(1, -1)}
                </button>
                <span lang={lang} className="text-sm text-slate-800">{sg.text || <em className="text-slate-500">(empty)</em>}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {showNote && <NoteFields required={source === "correction"} />}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <SubmitButton pendingLabel={tr("Saving…")}>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function TextArea({ areaRef, initialText, lang, placeholder, onChange }: { areaRef: React.RefObject<HTMLTextAreaElement | null>; initialText: string; lang: string; placeholder?: string; onChange: (v: string) => void }) {
  const tr = useT();
  const err = useFieldError("text");
  return (
    <div>
      <label htmlFor="transcript-text" className="mb-1 block text-sm font-medium text-slate-800">
        {tr("Statement text")} <span className="text-red-700" aria-hidden>*</span>
      </label>
      <textarea
        id="transcript-text"
        ref={areaRef}
        name="text"
        lang={lang}
        rows={16}
        maxLength={100_000}
        defaultValue={initialText}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!err}
        aria-describedby={err ? "transcript-text-error" : undefined}
        className={`${inputClass} text-[15px] leading-relaxed`}
      />
      {err && <p id="transcript-text-error" className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}

function NoteFields({ required }: { required: boolean }) {
  const tr = useT();
  const noteErr = useFieldError("note");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="tnote" className="mb-1 block text-sm font-medium text-slate-800">
          {required ? tr("What was corrected and why") : tr("Note (optional)")} {required && <span className="text-red-700" aria-hidden>*</span>}
        </label>
        <input id="tnote" name="note" maxLength={500} className={inputClass} aria-invalid={!!noteErr} aria-describedby={noteErr ? "tnote-err" : undefined} placeholder={required ? "e.g. Speaker corrected the time from 8 pm to 9 pm" : ""} />
        {noteErr && <p id="tnote-err" className="mt-1 text-xs font-medium text-red-700">{noteErr}</p>}
      </div>
      <div>
        <label htmlFor="tunc" className="mb-1 block text-sm font-medium text-slate-800">{tr("Uncertain passages (optional)")}</label>
        <input id="tunc" name="uncertaintyNote" maxLength={1000} className={inputClass} placeholder={tr("e.g. Name at 02:14 unclear in recording")} />
      </div>
    </div>
  );
}
