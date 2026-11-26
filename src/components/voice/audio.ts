"use client";
/**
 * Browser audio engine for the voice assistant.
 * - Mic capture → 16 kHz mono PCM16 → energy VAD → WAV utterances.
 * - TTS playback via /api/voice/tts (Gnani), with interrupt / barge-in support.
 */
import type { AudioEngine } from "./types";

const TARGET_RATE = 16000;
const FRAME = 320; // 20 ms at 16 kHz
const PRE_ROLL_FRAMES = 15; // 300 ms
const START_FRAMES = 3; // 60 ms above threshold to start
const END_SILENCE_FRAMES = 35; // 700 ms
const MIN_SPEECH_FRAMES = 15; // 300 ms
const MAX_FRAMES = 750; // 15 s
const IDLE_HINT_MS = 12_000;
const BASE_NOISE_FLOOR = 0.004;

const DEBUG = process.env.NODE_ENV !== "production";
const dbg = (...args: unknown[]) => { if (DEBUG) console.debug("[voice]", ...args); };

const WORKLET = `
class FrCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("fr-capture", FrCapture);
`;

function encodeWav(samples: Int16Array, rate = TARGET_RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  new Int16Array(buf, 44).set(samples);
  return new Blob([buf], { type: "audio/wav" });
}

/** Linear-interpolation resampler that keeps state across chunks. */
function makeResampler(inRate: number) {
  const ratio = inRate / TARGET_RATE;
  let pos = 0;
  let last = 0;
  return (input: Float32Array): Float32Array => {
    const out: number[] = [];
    while (pos < input.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = i - 1 >= 0 ? input[i - 1] : last;
      const b = input[i];
      out.push(a + (b - a) * frac);
      pos += ratio;
    }
    pos -= input.length;
    last = input[input.length - 1] ?? last;
    return Float32Array.from(out);
  };
}

/** Split long text into TTS-sized chunks at sentence boundaries. */
export function chunkText(text: string, max = 240): string[] {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[।.!?])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length > max && cur) { chunks.push(cur.trim()); cur = p; }
    else cur = (cur + " " + p).trim();
  }
  if (cur) chunks.push(cur.trim());
  return chunks.flatMap((c) => (c.length <= max ? [c] : c.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [c]));
}

/** Transcribe an utterance; `language` is the STT-detected code (e.g. "hi-IN", "en-IN"; "" if unknown). */
export async function transcribeWithLang(wav: Blob): Promise<{ text: string; language: string }> {
  const form = new FormData();
  form.append("audio", wav, "utterance.wav");
  const t0 = performance.now();
  const res = await fetch("/api/voice/stt", { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as { transcript?: string; language?: string; error?: string } | null;
  if (!res.ok) {
    dbg("STT error", res.status, json?.error);
    throw new Error(json?.error || `Speech recognition failed (${res.status}).`);
  }
  const out = { text: (json?.transcript || "").trim(), language: json?.language || "" };
  dbg(`STT ${Math.round(performance.now() - t0)}ms [${out.language || "?"}]`, JSON.stringify(out.text));
  return out;
}

export async function transcribe(wav: Blob): Promise<string> {
  return (await transcribeWithLang(wav)).text;
}

async function fetchTts(text: string, lang: "hi" | "en", signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: lang === "en" ? "en-IN" : "hi-IN" }),
    signal,
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error || `Speech playback failed (${res.status}).`);
  }
  return res.arrayBuffer();
}

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let captureNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  let workletUrl: string | null = null;

  // playback state
  let speaking = false;
  let currentSource: AudioBufferSourceNode | null = null;
  let playAbort: AbortController | null = null;
  let speakDone: (() => void) | null = null;
  /** Set when TTS stops: the VAD resets its noise floor (echo during playback inflates it). */
  let resetFloorPending = false;
  /** Idle-hint bookkeeping: armed after the assistant stops talking, cleared when speech starts. */
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleHandler: (() => void) | null = null;
  const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
  const armIdle = () => {
    clearIdle();
    if (!idleHandler) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!speaking) { dbg("idle hint: no speech for", IDLE_HINT_MS / 1000, "s"); idleHandler?.(); }
    }, IDLE_HINT_MS);
  };
  const onPlaybackEnded = () => {
    resetFloorPending = true;
    armIdle();
  };

  const ensureCtx = () => {
    if (!ctx || ctx.state === "closed") {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  const interrupt = () => {
    playAbort?.abort();
    playAbort = null;
    try { currentSource?.stop(); } catch { /* already stopped */ }
    currentSource = null;
    if (speaking) onPlaybackEnded();
    speaking = false;
    const done = speakDone;
    speakDone = null;
    done?.();
  };

  const speak = async (text: string, opts: { lang?: "hi" | "en" } = {}): Promise<void> => {
    const lang = opts.lang ?? "hi";
    interrupt();
    const chunks = chunkText(text).filter(Boolean);
    if (!chunks.length) return;
    const ac = ensureCtx();
    const abort = new AbortController();
    playAbort = abort;
    speaking = true;
    clearIdle();
    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (playAbort === abort) { speaking = false; playAbort = null; onPlaybackEnded(); }
        resolve();
      };
      speakDone = finish;
      (async () => {
        try {
          // Prefetch the next chunk while the current one plays.
          let next: Promise<ArrayBuffer> | null = fetchTts(chunks[0], lang, abort.signal);
          for (let i = 0; i < chunks.length; i++) {
            if (abort.signal.aborted || !next) break;
            const data = await next;
            next = i + 1 < chunks.length ? fetchTts(chunks[i + 1], lang, abort.signal) : null;
            if (abort.signal.aborted) break;
            const buffer = await ac.decodeAudioData(data.slice(0));
            if (abort.signal.aborted) break;
            await new Promise<void>((res) => {
              const src = ac.createBufferSource();
              src.buffer = buffer;
              src.connect(ac.destination);
              src.onended = () => res();
              currentSource = src;
              abort.signal.addEventListener("abort", () => res(), { once: true });
              src.start();
            });
          }
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") console.warn("[voice] playback error:", (e as Error)?.message);
        } finally {
          if (speakDone === finish) speakDone = null;
          finish();
        }
      })();
    });
  };

  const stop = () => {
    clearIdle();
    idleHandler = null;
    try { captureNode?.disconnect(); } catch { /* noop */ }
    try { sourceNode?.disconnect(); } catch { /* noop */ }
    if (captureNode && "port" in captureNode) captureNode.port.onmessage = null;
    if (captureNode && "onaudioprocess" in captureNode) captureNode.onaudioprocess = null;
    captureNode = null;
    sourceNode = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (workletUrl) { URL.revokeObjectURL(workletUrl); workletUrl = null; }
  };

  const start: AudioEngine["start"] = async ({ onUtterance, onLevel, onSpeechStart, onIdleHint }) => {
    stop();
    idleHandler = onIdleHint ?? null;
    const ac = ensureCtx();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    sourceNode = ac.createMediaStreamSource(stream);
    const resample = makeResampler(ac.sampleRate);

    // VAD state
    let pending = new Float32Array(0);
    let noiseFloor = BASE_NOISE_FLOOR;
    let lastLog = 0;
    let peak = 0;
    let inSpeech = false;
    let aboveCount = 0;
    let silentCount = 0;
    let speechFrames = 0;
    const preRoll: Float32Array[] = [];
    let utter: Float32Array[] = [];

    const finishUtterance = () => {
      const frames = utter;
      const voiced = speechFrames;
      utter = [];
      inSpeech = false;
      silentCount = 0;
      speechFrames = 0;
      if (voiced < MIN_SPEECH_FRAMES) return;
      const total = frames.reduce((n, f) => n + f.length, 0);
      const pcm = new Int16Array(total);
      let o = 0;
      for (const f of frames) for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); pcm[o++] = s < 0 ? s * 0x8000 : s * 0x7fff; }
      dbg(`utterance end: ${(pcm.length / TARGET_RATE).toFixed(2)}s, voiced ${(voiced * 0.02).toFixed(2)}s`);
      onUtterance(encodeWav(pcm));
    };

    const processFrame = (frame: Float32Array) => {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      const rms = Math.sqrt(sum / frame.length);
      onLevel?.(rms);
      // Higher threshold while TTS is playing so the assistant doesn't hear itself.
      if (resetFloorPending && !speaking) {
        // Playback just ended: forget the echo-inflated floor and use the normal (lower) threshold right away.
        resetFloorPending = false;
        noiseFloor = BASE_NOISE_FLOOR;
        aboveCount = 0;
      }
      const threshold = speaking ? Math.max(noiseFloor * 6, 0.045) : Math.max(noiseFloor * 2.5, 0.008);
      const loud = rms > threshold;
      peak = Math.max(peak, rms);
      if (DEBUG) {
        const nowMs = performance.now();
        if (nowMs - lastLog > 2000) {
          dbg(`level peak ${peak.toFixed(4)} · floor ${noiseFloor.toFixed(4)} · threshold ${threshold.toFixed(4)}${speaking ? " (speaking)" : ""}`);
          lastLog = nowMs;
          peak = 0;
        }
      }

      if (!inSpeech) {
        // Don't adapt the floor to our own TTS echo.
        if (!loud && !speaking) noiseFloor = Math.min(0.05, Math.max(0.002, noiseFloor * 0.95 + rms * 0.05));
        preRoll.push(frame);
        if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
        aboveCount = loud ? aboveCount + 1 : 0;
        if (aboveCount >= START_FRAMES) {
          inSpeech = true;
          utter = preRoll.splice(0);
          speechFrames = aboveCount;
          silentCount = 0;
          clearIdle();
          dbg(`utterance start (rms ${rms.toFixed(4)} > ${threshold.toFixed(4)})`);
          onSpeechStart?.();
        }
        return;
      }
      utter.push(frame);
      if (loud) { speechFrames++; silentCount = 0; } else silentCount++;
      if (silentCount >= END_SILENCE_FRAMES || utter.length >= MAX_FRAMES) finishUtterance();
    };

    const onChunk = (chunk: Float32Array) => {
      const down = resample(chunk);
      const merged = new Float32Array(pending.length + down.length);
      merged.set(pending);
      merged.set(down, pending.length);
      let off = 0;
      while (off + FRAME <= merged.length) { processFrame(merged.slice(off, off + FRAME)); off += FRAME; }
      pending = merged.slice(off);
    };

    if (ac.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ac.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ac, "fr-capture");
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data);
      sourceNode.connect(node);
      captureNode = node;
      dbg(`mic started (AudioWorklet, ${ac.sampleRate} Hz)`);
    } else {
      const node = ac.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => onChunk(e.inputBuffer.getChannelData(0).slice(0));
      sourceNode.connect(node);
      node.connect(ac.destination); // required for ScriptProcessor to run; outputs silence
      captureNode = node;
      dbg(`mic started (ScriptProcessor, ${ac.sampleRate} Hz)`);
    }
    if (!speaking) armIdle();
  };

  return {
    start,
    stop,
    speak,
    interrupt,
    isSpeaking: () => speaking,
  };
}
