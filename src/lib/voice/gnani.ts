/**
 * Server-only client for Gnani Vachana speech APIs (STT + TTS).
 * The API key is read from GNANI_API_KEY and is never logged or returned.
 */
import "server-only";

const STT_URL = "https://api.vachana.ai/stt/v3";
const TTS_URL = "https://api.vachana.ai/api/v1/tts/inference";

export class VoiceUnavailableError extends Error {
  constructor(message = "Voice assistant is not configured on this server.") {
    super(message);
    this.name = "VoiceUnavailableError";
  }
}

export class VoiceUpstreamError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "VoiceUpstreamError";
  }
}

export function voiceConfigured(): boolean {
  return !!process.env.GNANI_API_KEY;
}

function apiKey(): string {
  const k = process.env.GNANI_API_KEY;
  if (!k) throw new VoiceUnavailableError();
  return k;
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new VoiceUpstreamError("Speech service timed out.", 504);
    if (e instanceof VoiceUpstreamError || e instanceof VoiceUnavailableError) throw e;
    throw new VoiceUpstreamError("Speech service is unreachable.");
  } finally {
    clearTimeout(t);
  }
}

/** Hindi + English with automatic detection (verified live: returns digits, detects hi-IN / en-IN correctly). */
const STT_LANGUAGES = "hi-IN,en-IN";

/** Transcribe a short WAV utterance (Hindi / English / Hinglish) and report the detected language. */
export async function transcribeWithLang(
  audio: Blob | Buffer,
  opts: { language?: string } = {},
): Promise<{ text: string; language: string }> {
  const key = apiKey();
  const blob = audio instanceof Blob ? audio : new Blob([new Uint8Array(audio)], { type: "audio/wav" });
  return withTimeout(15_000, async (signal) => {
    const form = new FormData();
    form.append("audio_file", blob, "utterance.wav");
    form.append("model", "prisma-v3.0");
    form.append("language_code", opts.language || STT_LANGUAGES);
    const res = await fetch(STT_URL, { method: "POST", headers: { "X-API-Key-ID": key }, body: form, signal });
    if (!res.ok) throw new VoiceUpstreamError(`Speech-to-text failed (${res.status}).`, res.status === 429 ? 429 : 502);
    const json = (await res.json().catch(() => null)) as { success?: boolean; transcript?: string; detected_language_code?: string } | null;
    if (!json || json.success === false) throw new VoiceUpstreamError("Speech-to-text returned an invalid response.");
    return { text: (json.transcript || "").trim(), language: json.detected_language_code || "" };
  });
}

/** Transcribe and return only the text ("" when nothing was recognised). */
export async function transcribe(audio: Blob | Buffer, opts: { language?: string } = {}): Promise<string> {
  return (await transcribeWithLang(audio, opts)).text;
}

export type TtsLanguage = "hi-IN" | "en-IN";

/** Voice per language (Timbre v2.5 catalog): Nalini (Hindi, female), Devika (English, female, professional). */
const TTS_VOICES: Record<TtsLanguage, string> = { "hi-IN": "Nalini", "en-IN": "Devika" };

export function toTtsLanguage(v: unknown): TtsLanguage {
  return typeof v === "string" && /^en/i.test(v) ? "en-IN" : "hi-IN";
}

/** Synthesize speech (Hindi by default, or English); returns WAV bytes (24 kHz mono PCM16). */
export async function synthesize(
  text: string,
  opts: { voice?: string; speed?: number; language?: TtsLanguage } = {},
): Promise<ArrayBuffer> {
  const language = opts.language ?? "hi-IN";
  const key = apiKey();
  return withTimeout(20_000, async (signal) => {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": key },
      body: JSON.stringify({
        text,
        voice: opts.voice || TTS_VOICES[language],
        model: "timbre-v2.5",
        language,
        speed: opts.speed ?? 1.0,
        audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
      }),
      signal,
    });
    if (!res.ok) throw new VoiceUpstreamError(`Text-to-speech failed (${res.status}).`, res.status === 429 ? 429 : 502);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) throw new VoiceUpstreamError("Text-to-speech returned empty audio.");
    return buf;
  });
}
