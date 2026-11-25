"use client";
import { useT } from "@/lib/i18n/client";
/**
 * Automatic transcription panel. Decodes the saved recording in the browser and
 * runs Whisper on-device in a Web Worker. Produces timestamped segments that
 * staff then check and correct against the recording.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, RotateCcw, Square, CheckCircle2, AlertCircle } from "lucide-react";
import { buttonClass, cx, inputClass } from "@/components/ui";
import { segmentsToText } from "./timestamps";

export const WHISPER_MODELS = [
  { id: "onnx-community/whisper-base", label: "Standard (faster, ~80 MB download)" },
  { id: "onnx-community/whisper-small", label: "High accuracy (slower, ~250 MB download)" },
] as const;

type Phase =
  | { k: "idle" }
  | { k: "fetching" }
  | { k: "decoding" }
  | { k: "loading"; loaded?: number; total?: number }
  | { k: "transcribing"; device?: string; startedAt: number }
  | { k: "done"; segments: number; device: string; seconds: number }
  | { k: "error"; message: string };

export interface AutoTranscriptResult {
  text: string;
  model: string;
  device: string;
}

export function AutoTranscribe({
  recordingUrl,
  language,
  autoStart,
  onResult,
}: {
  recordingUrl: string;
  language: string;
  autoStart: boolean;
  onResult: (r: AutoTranscriptResult) => void;
}) {
  const tr = useT();
  const [model, setModel] = useState<string>(language === "hi" ? WHISPER_MODELS[1].id : WHISPER_MODELS[0].id);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const worker = useRef<Worker | null>(null);
  const started = useRef(false);
  const [now, setNow] = useState(0);

  const busy = phase.k === "fetching" || phase.k === "decoding" || phase.k === "loading" || phase.k === "transcribing";

  useEffect(() => {
    if (phase.k !== "transcribing") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase.k]);

  useEffect(() => () => worker.current?.terminate(), []);

  const stop = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setPhase({ k: "idle" });
  }, []);

  const run = useCallback(async () => {
    try {
      setPhase({ k: "fetching" });
      const res = await fetch(recordingUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "The playback link expired. Reload the page and try again." : `Could not load the recording (HTTP ${res.status}).`);
      const buf = await res.arrayBuffer();

      setPhase({ k: "decoding" });
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx({ sampleRate: 16000 });
      let decoded: AudioBuffer;
      try {
        decoded = await ctx.decodeAudioData(buf);
      } catch {
        throw new Error(tr("This browser could not decode the recording's audio. Try Chrome or Edge, or transcribe manually."));
      } finally {
        ctx.close().catch(() => {});
      }
      const audio = new Float32Array(decoded.length);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const ch = decoded.getChannelData(c);
        for (let i = 0; i < ch.length; i++) audio[i] += ch[i] / decoded.numberOfChannels;
      }
      if (decoded.duration < 0.5) throw new Error(tr("The recording is too short to transcribe."));

      worker.current?.terminate();
      const w = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      setPhase({ k: "loading" });
      const startedAt = Date.now();
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "download") setPhase({ k: "loading", loaded: m.loaded, total: m.total });
        else if (m.type === "status" && m.status === "transcribing") setPhase({ k: "transcribing", device: m.device, startedAt: Date.now() });
        else if (m.type === "done") {
          const text = segmentsToText(m.chunks);
          if (!text.trim()) {
            setPhase({ k: "error", message: tr("No speech was recognised in this recording. Check the audio, or transcribe manually.") });
          } else {
            setPhase({ k: "done", segments: m.chunks.length, device: m.device, seconds: Math.round((Date.now() - startedAt) / 1000) });
            onResult({ text, model, device: m.device });
          }
          w.terminate();
          worker.current = null;
        } else if (m.type === "error") {
          setPhase({ k: "error", message: `Automatic transcription failed: ${m.message}` });
          w.terminate();
          worker.current = null;
        }
      };
      w.onerror = (e) => {
        setPhase({ k: "error", message: `Automatic transcription could not start: ${e.message || "worker error"}` });
        worker.current = null;
      };
      w.postMessage(
        {
          type: "transcribe",
          audio,
          language: language === "hi" ? "hindi" : language === "en" ? "english" : null,
          model,
          localModels: process.env.NEXT_PUBLIC_WHISPER_LOCAL_MODELS === "true",
        },
        [audio.buffer],
      );
    } catch (e) {
      setPhase({ k: "error", message: (e as Error).message });
    }
  }, [recordingUrl, language, model, onResult, tr]);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      // Defer to avoid a synchronous state update during the effect.
      const t = setTimeout(run, 0);
      return () => clearTimeout(t);
    }
  }, [autoStart, run]);

  const pct = phase.k === "loading" && phase.total ? Math.min(100, Math.round(((phase.loaded ?? 0) / phase.total) * 100)) : null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AudioLines className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-navy-900">{tr("Automatic transcription (on this device)")}</p>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-700">
              {tr("Speech is converted to text by the Whisper speech-recognition model running in this browser. The recording is not sent to any external service. The result is machine-generated and can contain mistakes: check every segment against the recording and correct names, numbers and places before saving.")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-navy-900">
            {tr("Accuracy")}
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy} className={cx(inputClass, "mt-1 w-auto !min-h-9 !py-1.5 text-xs")}>
              {WHISPER_MODELS.map((m) => <option key={m.id} value={m.id}>{tr(m.label)}</option>)}
            </select>
          </label>
          {busy ? (
            <button type="button" onClick={stop} className={buttonClass("secondary")}>
              <Square className="h-4 w-4" aria-hidden /> {tr("Stop")}
            </button>
          ) : (
            <button type="button" onClick={run} className={buttonClass("primary")}>
              {phase.k === "done" || phase.k === "error" ? <RotateCcw className="h-4 w-4" aria-hidden /> : <AudioLines className="h-4 w-4" aria-hidden />}
              {phase.k === "done" || phase.k === "error" ? "Transcribe again" : "Transcribe automatically"}
            </button>
          )}
        </div>
      </div>

      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {phase.k === "fetching" && <Line icon="spin">{tr("Loading the recording…")}</Line>}
        {phase.k === "decoding" && <Line icon="spin">{tr("Preparing audio…")}</Line>}
        {phase.k === "loading" && (
          <div>
            <Line icon="spin">{pct === null ? "Loading speech-recognition model…" : `Downloading speech-recognition model (first time only)… ${pct}%`}</Line>
            {pct !== null && (
              <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-200" aria-hidden>
                <div className="h-full bg-navy-700 transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        )}
        {phase.k === "transcribing" && (
          <Line icon="spin">
            {tr("Transcribing")}{phase.device === "webgpu" ? " (GPU)" : ""}… {now > phase.startedAt ? `${Math.round((now - phase.startedAt) / 1000)}s` : ""} — {tr("long recordings can take a few minutes. You can keep this page open.")}
          </Line>
        )}
        {phase.k === "done" && (
          <Line icon="ok">
            {tr("Done: {n} timestamped segment(s) in {s}s. Review and correct the text below, then save.", { n: phase.segments, s: phase.seconds })}
          </Line>
        )}
        {phase.k === "error" && <Line icon="err">{phase.message}</Line>}
      </div>
    </div>
  );
}

function Line({ icon, children }: { icon: "spin" | "ok" | "err"; children: React.ReactNode }) {
  return (
    <p className={cx("flex items-start gap-2", icon === "err" ? "text-red-800" : icon === "ok" ? "text-emerald-800" : "text-navy-800")}>
      {icon === "spin" && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {icon === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      {icon === "err" && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}
