/**
 * Shared contract for the FirstRecord voice assistant ("FirstRecord साथी").
 *
 * Pipeline (no LLM tool calling, low latency):
 *   mic → VAD → WAV utterance → POST /api/voice/stt (Gnani STT) → transcript
 *   → deterministic Hindi/Hinglish dialog manager (dialog.ts) → { say, actions }
 *   → UI automation (automation.ts) runs actions while TTS (POST /api/voice/tts) speaks `say`.
 *
 * The Gnani API key never reaches the browser: both routes proxy server-side.
 */

/** Logical form fields the dialog can fill; automation.ts maps them to real inputs. */
export type VoiceField =
  // New report (FIR intake), step 1 — src/components/intake/intake-form.tsx
  | "report.speakerName"
  | "report.speakerContact"
  | "report.speakerAddress"
  | "report.incidentType" // value is an incident-type key (see dialog.ts INCIDENT_TYPES)
  | "report.incidentDate" // ISO date or datetime-local string
  | "report.incidentLocation"
  // Statement text (typed method) on the intake detail page
  | "report.statement"
  // SOS raise form — src/components/sos/raise-form.tsx
  | "sos.title"
  | "sos.message"
  | "sos.locationText";

/** Where the mascot should fly before an action (purely visual). */
export type VoiceTarget =
  | { kind: "nav"; href: string } // sidebar link with this href
  | { kind: "field"; field: VoiceField }
  | { kind: "submit"; form: "report" | "sos" }
  | { kind: "center" }
  | { kind: "home" }; // back to the bottom-right corner

export type VoiceAction =
  | { type: "navigate"; href: string }
  | { type: "fill"; field: VoiceField; value: string }
  | { type: "submit"; form: "report" | "sos" }
  /** Find a case by spoken reference/number/title and open it (uses the command-palette search action). */
  | { type: "openCase"; query: string }
  | { type: "fly"; to: VoiceTarget }
  /**
   * Press the primary forward button of the current intake wizard step (/intake/{id}?step=…).
   * `step` = the step the dialog believes it is acting on (intake | method | consent | capture | transcript |
   * draft | review | case); MASCOT may skip the press if the page is on a different step.
   */
  | { type: "advanceIntake"; step?: string }
  /** End the session: mascot returns home, mic stops. */
  | { type: "end" };

export interface DialogTurn {
  /** Hindi (Devanagari, Hinglish allowed) text to speak and caption. Empty = say nothing. */
  say: string;
  /** Actions to run, in order, while `say` is being spoken. */
  actions: VoiceAction[];
  /** false → session ends after speaking (e.g. goodbye). */
  expectReply: boolean;
  /** Language of `say` — pass to AudioEngine.speak so TTS uses the matching voice. Defaults to "hi". */
  lang?: "hi" | "en";
}

export interface DialogContext {
  userName: string;
  /** Current pathname, e.g. "/sos" — lets the dialog adapt. */
  pathname: () => string;
  /** Initial reply language (greeting). Defaults to "hi". */
  lang?: "hi" | "en";
  /**
   * Current intake wizard step when on /intake/{id} (intake | method | consent | capture | capture:saved |
   * transcript | draft | review | case | complete), else null. Provided by MASCOT.
   */
  intakeStep?: () => string | null;
}

export interface Dialog {
  greet(): DialogTurn;
  /** `language` = STT detected language code (e.g. "hi-IN" / "en-IN") — optional, improves reply-language choice. */
  handle(transcript: string, opts?: { language?: string }): DialogTurn;
  /** Called when automation reports a failure (e.g. case not found). */
  onActionResult(result: { action: VoiceAction; ok: boolean; detail?: string }): DialogTurn | null;
  /**
   * MASCOT calls this when the intake wizard lands on a new step while a session is active
   * (same step strings as DialogContext.intakeStep). Returns the prompt for that step, or null.
   */
  onIntakeStep?(step: string): DialogTurn | null;
}

/** Client audio engine (audio.ts). */
export interface AudioEngine {
  /** Ask for mic permission and start VAD; each finished utterance is delivered as a 16 kHz mono WAV Blob. */
  start(handlers: {
    onUtterance: (wav: Blob) => void;
    onLevel?: (rms: number) => void;
    onSpeechStart?: () => void;
    /** Fired once when no speech is detected for 12 s after the assistant stopped talking (re-armed after each speak). */
    onIdleHint?: () => void;
  }): Promise<void>;
  stop(): void;
  /** Speak text via /api/voice/tts; resolves when playback ends (or is interrupted). `lang` picks the voice (default "hi"). */
  speak(text: string, opts?: { lang?: "hi" | "en" }): Promise<void>;
  /** Stop any current playback immediately (barge-in). */
  interrupt(): void;
  isSpeaking(): boolean;
}

export const VOICE_EVENTS = {
  /** window event to open the assistant from anywhere (detail: none) */
  open: "firstrecord-voice-open",
} as const;
