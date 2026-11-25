"use client";
import { useT } from "@/lib/i18n/client";
/**
 * Browser audio/video recorder (MediaRecorder). Never reports a recording as
 * saved unless the server responds 201. Failed uploads keep the blob in memory
 * so staff can retry. No local download is offered, to avoid stray copies of
 * sensitive data on shared devices.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Circle, Pause, Play, Square, Trash2, UploadCloud, AlertTriangle, CheckCircle2, Loader2, Hand } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { ConfirmDialog, useToast } from "@/components/forms";
import { formatTimestamp } from "./timestamps";

type Phase = "idle" | "requesting" | "ready" | "recording" | "paused" | "stopped" | "uploading" | "saved" | "error";

const MIME_CANDIDATES = {
  audio: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"],
  video: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"],
};

const noopSubscribe = () => () => {};

function pickMime(kind: "audio" | "video") {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES[kind].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export function Recorder({
  statementId,
  kind,
  maxBytes,
  withdrawConsent,
  withdrawLabel,
  instructions,
  lang,
}: {
  statementId: string;
  kind: "audio" | "video";
  maxBytes: number;
  withdrawConsent: (statementId: string, scope: "audio" | "video", lang: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
  withdrawLabel: string;
  instructions: string;
  lang: string;
}) {
  const tr = useT();
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined",
    () => null,
  );

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const accumulated = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVideo = useRef<HTMLVideoElement>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => stopTracks(), [stopTracks]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Warn before leaving with an unsaved recording.
  useEffect(() => {
    const unsaved = phase === "recording" || phase === "paused" || (!!blob && phase !== "saved");
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase, blob]);

  function tick() {
    setElapsed(accumulated.current + (Date.now() - startedAt.current));
  }

  async function requestDevice() {
    setError(null);
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === "video" ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } } : { audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((t) => (t.onended = () => {
        if (recRef.current && recRef.current.state !== "inactive") {
          setError(tr("The recording device was disconnected or blocked. What was captured so far is kept below."));
          recRef.current.stop();
        }
      }));
      if (kind === "video" && liveVideo.current) {
        liveVideo.current.srcObject = stream;
        await liveVideo.current.play().catch(() => {});
      }
      setPhase("ready");
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Permission to use the microphone/camera was denied. Allow access in the browser settings, or continue with typed or staff-assisted entry."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? `No ${kind === "video" ? "camera/microphone" : "microphone"} was found on this device.`
            : "The recording device could not be started. Continue with typed or staff-assisted entry if the problem persists.",
      );
      setPhase("error");
    }
  }

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime(kind);
    if (mime === null) { setError(tr("This browser cannot record media.")); setPhase("error"); return; }
    try {
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const b = new Blob(chunks.current, { type: (rec.mimeType || mime || `${kind}/webm`).split(";")[0] });
        if (timer.current) clearInterval(timer.current);
        stopTracks();
        if (b.size === 0) { setError(tr("Nothing was recorded.")); setPhase("error"); return; }
        setBlob(b);
        setPreviewUrl(URL.createObjectURL(b));
        setPhase("stopped");
      };
      rec.onerror = () => { setError(tr("Recording failed unexpectedly. Anything captured is kept below if available.")); };
      rec.start(1000);
      recRef.current = rec;
      accumulated.current = 0;
      startedAt.current = Date.now();
      timer.current = setInterval(tick, 250);
      setElapsed(0);
      setPhase("recording");
    } catch {
      setError(tr("Recording could not start in this browser."));
      setPhase("error");
    }
  }

  function pause() {
    const r = recRef.current;
    if (!r || r.state !== "recording" || typeof r.pause !== "function") return;
    r.pause();
    accumulated.current += Date.now() - startedAt.current;
    if (timer.current) clearInterval(timer.current);
    setPhase("paused");
  }

  function resume() {
    const r = recRef.current;
    if (!r || r.state !== "paused") return;
    r.resume();
    startedAt.current = Date.now();
    timer.current = setInterval(tick, 250);
    setPhase("recording");
  }

  function stop() {
    const r = recRef.current;
    if (!r || r.state === "inactive") return;
    if (r.state === "recording") accumulated.current += Date.now() - startedAt.current;
    setElapsed(accumulated.current);
    r.stop();
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setElapsed(0);
    setProgress(0);
    setError(null);
    setPhase("idle");
  }

  function upload() {
    if (!blob) return;
    if (blob.size > maxBytes) { setError(`The recording is larger than the ${Math.round(maxBytes / 1048576)} MB limit and cannot be saved.`); setPhase("error"); return; }
    setPhase("uploading");
    setError(null);
    setProgress(0);
    const fd = new FormData();
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    fd.append("file", blob, `recording.${ext}`);
    fd.append("kind", kind);
    fd.append("durationMs", String(Math.round(elapsed)));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/statements/${statementId}/recordings`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status === 201) {
        setPhase("saved");
        toast.show(tr("Recording saved securely."), "success");
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setBlob(null);
        setPreviewUrl(null);
        router.refresh();
      } else {
        let msg = `Saving failed (HTTP ${xhr.status}).`;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        setError(`${msg} The recording has NOT been saved. It is still held on this page — retry, or discard it.`);
        setPhase("error");
      }
    };
    xhr.onerror = () => {
      setError(tr("Network error — the recording has NOT been saved. It is still held on this page; retry when the connection is back."));
      setPhase("error");
    };
    xhr.send(fd);
  }

  async function doWithdraw() {
    setConfirmWithdraw(false);
    const r = recRef.current;
    if (r && r.state !== "inactive") {
      r.onstop = null;
      r.stop();
    }
    stopTracks();
    const res = await withdrawConsent(statementId, kind, lang);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setPhase("idle");
    if (res.ok) toast.show(tr("Consent withdrawn. The in-progress recording was discarded and not saved."), "info");
    else toast.show(res.error ?? tr("Could not record withdrawal."), "error");
    router.refresh();
  }

  if (supported === false) {
    return (
      <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {tr("This browser or device does not support in-browser recording (or the page is not served over HTTPS). Continue with typed or staff-assisted entry.")}
      </div>
    );
  }

  const recording = phase === "recording" || phase === "paused";
  return (
    <div className="space-y-4">
      <p lang={lang} className="text-sm text-slate-700">{instructions}</p>

      {kind === "video" && (
        <video ref={liveVideo} muted playsInline aria-label={tr("Camera preview")} className={cx("aspect-video w-full max-w-xl rounded-md bg-slate-900", !(phase === "ready" || recording) && "hidden")} />
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex min-w-36 items-center gap-2" role="status" aria-live="polite">
          {phase === "recording" ? (
            <>
              <span className="relative flex h-3 w-3" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
              </span>
              <span className="text-sm font-semibold text-red-700">{tr("Recording")}</span>
            </>
          ) : phase === "paused" ? (
            <span className="text-sm font-semibold text-amber-700">{tr("Paused")}</span>
          ) : phase === "uploading" ? (
            <span className="flex items-center gap-1.5 text-sm text-slate-700"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {tr("Saving…")} {progress}%</span>
          ) : phase === "saved" ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden /> {tr("Saved")}</span>
          ) : phase === "stopped" ? (
            <span className="text-sm font-medium text-slate-700">{tr("Not yet saved")}</span>
          ) : (
            <span className="text-sm text-slate-500">{phase === "requesting" ? tr("Requesting device…") : phase === "ready" ? tr("Ready") : tr("Not recording")}</span>
          )}
          <span className="font-mono text-sm tabular-nums text-slate-800" aria-label={tr("Elapsed {time}", { time: formatTimestamp(elapsed) })}>{formatTimestamp(elapsed)}</span>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {(phase === "idle" || phase === "saved") && (
            <button type="button" className={buttonClass("primary")} onClick={requestDevice}>
              <Circle className="h-4 w-4" aria-hidden /> {phase === "saved" ? "Record another" : `Prepare ${kind === "video" ? "camera" : "microphone"}`}
            </button>
          )}
          {phase === "error" && !blob && (
            <button type="button" className={buttonClass("secondary")} onClick={requestDevice}>{tr("Try again")}</button>
          )}
          {phase === "ready" && (
            <button type="button" className={buttonClass("danger")} onClick={start}>
              <Circle className="h-4 w-4 fill-current" aria-hidden /> {tr("Start recording")}
            </button>
          )}
          {phase === "recording" && typeof MediaRecorder !== "undefined" && "pause" in MediaRecorder.prototype && (
            <button type="button" className={buttonClass("secondary")} onClick={pause}><Pause className="h-4 w-4" aria-hidden /> {tr("Pause")}</button>
          )}
          {phase === "paused" && (
            <button type="button" className={buttonClass("secondary")} onClick={resume}><Play className="h-4 w-4" aria-hidden /> {tr("Resume")}</button>
          )}
          {recording && (
            <button type="button" className={buttonClass("primary")} onClick={stop}><Square className="h-4 w-4" aria-hidden /> {tr("Stop")}</button>
          )}
          {(phase === "stopped" || (phase === "error" && blob)) && (
            <>
              <button type="button" className={buttonClass("primary")} onClick={upload}><UploadCloud className="h-4 w-4" aria-hidden /> {phase === "error" ? "Retry save" : "Save recording"}</button>
              <button type="button" className={buttonClass("secondary")} onClick={() => setConfirmDiscard(true)}><Trash2 className="h-4 w-4" aria-hidden /> {tr("Discard")}</button>
            </>
          )}
          {(recording || phase === "ready" || phase === "stopped") && (
            <button type="button" className={buttonClass("ghost")} onClick={() => setConfirmWithdraw(true)} lang={lang}>
              <Hand className="h-4 w-4" aria-hidden /> {withdrawLabel}
            </button>
          )}
        </div>
      </div>

      {phase === "uploading" && (
        <div className="h-2 w-full overflow-hidden rounded bg-slate-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={tr("Upload progress")}>
          <div className="h-full bg-navy-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{error}</span>
        </div>
      )}

      {previewUrl && (
        <div>
          <p className="mb-1 text-sm font-medium text-slate-800">{tr("Preview (not yet saved)")}</p>
          {kind === "video" ? (
            <video src={previewUrl} controls className="aspect-video w-full max-w-xl rounded-md bg-slate-900" />
          ) : (
            <audio src={previewUrl} controls className="w-full max-w-xl" />
          )}
        </div>
      )}

      {confirmDiscard && (
        <ConfirmDialog title={tr("Discard this recording?")} confirmLabel={tr("Discard")} danger onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); discard(); }}>
          {tr("The unsaved recording will be permanently removed from this page. This cannot be undone.")}
        </ConfirmDialog>
      )}
      {confirmWithdraw && (
        <ConfirmDialog title={tr("Record consent withdrawal?")} confirmLabel={tr("Withdraw consent and stop")} danger onCancel={() => setConfirmWithdraw(false)} onConfirm={doWithdraw}>
          {tr("Recording stops immediately and anything not yet saved is discarded. Recordings already saved are kept under the retention policy. The statement can continue in writing or with staff help.")}
        </ConfirmDialog>
      )}
    </div>
  );
}
