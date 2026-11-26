"use client";
/**
 * FirstRecord साथी — voice assistant orchestrator.
 *
 * Mounted once in the app shell (persists across client navigations).
 * mic → VAD utterance → transcribe (Gnani STT via /api/voice/stt) → dialog.handle
 * → actions (automation.ts) run while engine.speak (Gnani TTS via /api/voice/tts).
 * During a call only the mascot is visible (with small mute / end buttons);
 * captions go to an sr-only live region for screen readers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IntroBubble, Mascot, MascotControls, MascotHint, SrLive, mascotHeight, type MascotPos } from "./mascot";
import { MascotStyles, type MascotMood } from "./mascot-art";
import { createAutomation, readIntakeStepForDialog, readVoiceFields } from "./automation";
import * as audio from "./audio";
import { createDialog } from "./dialog";
import { VOICE_EVENTS, type AudioEngine, type Dialog, type DialogSnapshot, type DialogTurn, type VoiceAction, type VoiceTarget } from "./types";
import { useT } from "@/lib/i18n/client";

type Stage = "home" | "intro" | "session";
type Lang = DialogTurn["lang"];
const INTRO_KEY = "fr_mascot_intro_v1";
/** Active call snapshot, so a call survives full page loads (e.g. a hard navigation). */
const SESSION_KEY = "fr_voice_session_v1";
const RESUME_WINDOW_MS = 2 * 60 * 1000;

interface SavedSession {
  at: number;
  user: string;
  snap: DialogSnapshot;
  pos: MascotPos;
  muted: boolean;
}

function readSavedSession(user: string): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    if (!s || s.user !== user || typeof s.at !== "number" || Date.now() - s.at > RESUME_WINDOW_MS || !s.snap) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function clearSavedSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked */
  }
}

/** True when audio can start without a fresh user gesture (after a reload it usually can't). */
function audioCanAutoplay(): boolean {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    const c = new AC();
    const ok = c.state === "running";
    void c.close();
    return ok;
  } catch {
    return false;
  }
}
const HOME_SIZE = 72;
const CENTER_SIZE = 150;
const DOCK_SIZE = 104;
const MARGIN = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Optional bilingual APIs (VOICE-CORE): used when present, ignored otherwise. */
type TranscribeWithLang = (wav: Blob) => Promise<{ text: string; language?: string }>;
const audioMod = audio as unknown as { transcribe: (wav: Blob) => Promise<string>; transcribeWithLang?: TranscribeWithLang };
async function transcribeAny(wav: Blob): Promise<{ text: string; language?: string }> {
  if (typeof audioMod.transcribeWithLang === "function") return audioMod.transcribeWithLang(wav);
  return { text: await audioMod.transcribe(wav) };
}
function handleAny(dlg: Dialog, text: string, language: string | undefined): DialogTurn {
  return dlg.handle(text, language ? { language } : undefined);
}
function speakAny(engine: AudioEngine, text: string, lang: DialogTurn["lang"]): Promise<void> {
  return engine.speak(text, lang ? { lang } : undefined);
}

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}
function homePos(): MascotPos {
  const { w, h } = viewport();
  return { x: w - MARGIN - HOME_SIZE, y: h - MARGIN - mascotHeight(HOME_SIZE), size: HOME_SIZE };
}
function centerPos(): MascotPos {
  const { w, h } = viewport();
  return { x: (w - CENTER_SIZE) / 2, y: Math.max(24, (h - mascotHeight(CENTER_SIZE)) / 2 - 90), size: CENTER_SIZE };
}
/** Docked spot during a call: bottom-right, a little larger than the resting cap. */
function dockPos(): MascotPos {
  const { w, h } = viewport();
  return { x: w - MARGIN - DOCK_SIZE - 6, y: h - MARGIN - mascotHeight(DOCK_SIZE) - 10, size: DOCK_SIZE };
}
function clampPos(p: MascotPos): MascotPos {
  const { w, h } = viewport();
  return {
    size: p.size,
    x: Math.max(8, Math.min(w - p.size - 8, p.x)),
    y: Math.max(8, Math.min(h - mascotHeight(p.size) - 8, p.y)),
  };
}

declare global {
  interface Window {
    /** Dev-only: drive the dialog with text (no microphone needed). */
    __voiceTest?: (text: string) => void;
    /** Dev-only: current values of the voice-fillable fields on the page. */
    __voiceFields?: () => Record<string, string>;
    /** Dev-only: run advanceIntake directly and return its result. */
    __voiceAdvance?: (step?: string) => Promise<{ ok: boolean; detail?: string }>;
    /** Dev-only: recent actions and their results. */
    __voiceLog?: { action: VoiceAction; ok: boolean; detail?: string; at: number }[];
  }
}

export function VoiceAssistant({ userName }: { userName: string }) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<Stage>("home");
  const [pos, setPos] = useState<MascotPos>({ x: -200, y: -200, size: HOME_SIZE });
  const [moving, setMoving] = useState(false);
  const [mood, setMood] = useState<MascotMood>("idle");
  const [level, setLevel] = useState(0);
  const [tapKey, setTapKey] = useState(0);
  const [status, setStatus] = useState("");
  const [lastSpoken, setLastSpoken] = useState("");
  const [hint, setHint] = useState("");
  const [muted, setMuted] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [faded, setFaded] = useState(false);

  const stageRef = useRef<Stage>("home");
  const mutedRef = useRef(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const dialogRef = useRef<Dialog | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mascotRef = useRef<HTMLButtonElement>(null);
  const speakAnim = useRef<ReturnType<typeof setInterval> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef(pathname);
  const runTurnRef = useRef<(turn: DialogTurn) => Promise<void>>(async () => {});
  const posRef = useRef(pos);
  /** >0 while a voice action is animating the mascot (cursor-rest must not interfere) */
  const busyRef = useRef(0);
  /** intake step tracking (announce new steps once) */
  const lastStepRef = useRef<string | null>(null);
  const announcedStepRef = useRef<string | null>(null);
  /** After a reload the browser needs a tap before audio/mic can run; the call waits for it. */
  const needsTapRef = useRef(false);
  const resumedRef = useRef(false);
  const moodRef = useRef<MascotMood>("idle");
  const levelTick = useRef(0);
  /** last navigation the assistant itself started (to tell manual navigation apart) */
  const assistantNavRef = useRef<{ href: string; at: number } | null>(null);
  /** cursor-rest bookkeeping (shared so navigation / voice actions can cancel a pending rest) */
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const lastPtrRef = useRef<{ x: number; y: number } | null>(null);
  const cancelRest = useCallback(() => {
    if (restTimerRef.current) clearTimeout(restTimerRef.current);
    restTimerRef.current = null;
    // require a fresh (≥12px) movement before the next rest
    if (lastPtrRef.current) restAnchorRef.current = { ...lastPtrRef.current };
  }, []);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  const moveTo = useCallback(async (p: MascotPos, ms = 650) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // fade-move: hide, jump, show
      setFaded(true);
      await sleep(180);
      setPos(clampPos(p));
      await sleep(30);
      setFaded(false);
      await sleep(180);
      return;
    }
    setMoving(true);
    setPos(clampPos(p));
    await sleep(ms);
    setMoving(false);
  }, []);

  const showHint = useCallback((text: string, ms = 4500) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(""), ms);
  }, []);

  // ---------- mount + intro trigger ----------
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMounted(true);
      setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
      setPos(homePos());
    });
    const key = `${INTRO_KEY}:${userName}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!sessionStorage.getItem(key) && !readSavedSession(userName)) {
        timer = setTimeout(async () => {
          if (stageRef.current !== "home" || sessionStorage.getItem(key)) return;
          // Mark as shown only when the intro really starts (survives StrictMode double effects).
          sessionStorage.setItem(key, String(Date.now()));
          await moveTo(centerPos(), 900);
          setStage("intro");
        }, 900);
      }
    } catch {
      /* storage blocked: skip intro */
    }
    const onResize = () => {
      const s = stageRef.current;
      if (s === "home") setPos(homePos());
      else if (s === "intro") setPos(centerPos());
      else setPos(clampPos(posRef.current));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [userName, moveTo]);

  const idleStatus = useCallback(() => {
    setMood(mutedRef.current ? "idle" : "listening");
    setStatus(mutedRef.current ? tr("Muted") : tr("Listening…"));
  }, [tr]);

  // ---------- fly helpers for automation ----------
  const flyTo = useCallback(
    async (rect: DOMRect | null, target: VoiceTarget) => {
      if (stageRef.current !== "session" && target.kind !== "home") return;
      const size = target.kind === "nav" ? 100 : 88;
      const h = mascotHeight(size);
      if (target.kind === "home") {
        await moveTo(homePos());
        return;
      }
      if (target.kind === "center") {
        await moveTo({ ...centerPos(), size: 120 });
        return;
      }
      if (!rect) {
        await moveTo(dockPos());
        return;
      }
      const { w } = viewport();
      let x = rect.right + 12;
      if (x + size > w - 8) x = rect.left - size - 12;
      if (target.kind === "nav") x = rect.right + 10;
      const y = rect.top + rect.height / 2 - h / 2;
      await moveTo({ x, y, size }, 600);
      if (target.kind === "nav" || target.kind === "submit") {
        setTapKey((k) => k + 1);
        await sleep(360);
      }
    },
    [moveTo],
  );

  const automationRef = useRef<ReturnType<typeof createAutomation> | null>(null);
  useEffect(() => {
    automationRef.current = createAutomation({
      push: (href) => {
        assistantNavRef.current = { href, at: Date.now() };
        router.push(href);
      },
      flyTo: async (r, t) => {
        busyRef.current += 1;
        try {
          await flyTo(r, t);
        } finally {
          busyRef.current -= 1;
        }
      },
    });
  }, [router, flyTo]);

  // ---------- speaking ----------
  const startSpeakAnim = () => {
    if (speakAnim.current) clearInterval(speakAnim.current);
    speakAnim.current = setInterval(() => setLevel(0.25 + Math.random() * 0.75), 110);
  };
  const stopSpeakAnim = () => {
    if (speakAnim.current) clearInterval(speakAnim.current);
    speakAnim.current = null;
    setLevel(0);
  };

  const speak = useCallback(
    async (text: string, lang: Lang) => {
      if (!text) return;
      setMood("speaking");
      setStatus(tr("Speaking…"));
      startSpeakAnim();
      try {
        if (engineRef.current) await speakAny(engineRef.current, text, lang);
      } catch {
        showHint(tr("Couldn't reach the voice service."));
        await sleep(Math.min(4000, 60 * text.length));
      } finally {
        stopSpeakAnim();
      }
    },
    [tr, showHint],
  );

  // ---------- end session ----------
  const endSession = useCallback(async () => {
    if (stageRef.current !== "session") return;
    stageRef.current = "home";
    needsTapRef.current = false;
    clearSavedSession();
    automationRef.current?.abort();
    engineRef.current?.interrupt();
    engineRef.current?.stop();
    engineRef.current = null;
    stopSpeakAnim();
    setMood("idle");
    setStage("home");
    setStatus("");
    await moveTo(homePos(), 800);
    mascotRef.current?.focus({ preventScroll: true });
  }, [moveTo]);

  // ---------- turns ----------
  const runActions = useCallback(async (actions: VoiceAction[]) => {
    const dlg = dialogRef.current;
    if (actions.length) cancelRest();
    busyRef.current += 1;
    try {
      for (const action of actions) {
        if (stageRef.current !== "session") return;
        if (action.type === "end") continue; // handled after speaking
        const res = (await automationRef.current?.run(action)) ?? { ok: false };
        if (process.env.NODE_ENV !== "production") {
          window.__voiceLog = [...(window.__voiceLog ?? []).slice(-40), { action, ok: res.ok, detail: res.detail, at: Date.now() }];
        }
        const follow = dlg?.onActionResult({ action, ok: res.ok, detail: res.detail });
        if (action.type === "advanceIntake" && res.ok && follow) {
          // the follow-up already announces the new step; otherwise the step poller asks
          // the dialog (onIntakeStep) on its next tick
          const st = readIntakeStepForDialog();
          lastStepRef.current = st;
          announcedStepRef.current = st;
        }
        if (follow) queueRef.current = queueRef.current.then(() => runTurnRef.current(follow));
      }
      // The mascot stays wherever the last action took it. Only the greeting's
      // centre appearance returns to the docked spot (so it doesn't cover the page).
      const last = actions[actions.length - 1];
      if (stageRef.current === "session" && last?.type === "fly" && last.to.kind === "center") {
        await sleep(1400);
        if (stageRef.current === "session") await moveTo(dockPos(), 650);
      }
    } finally {
      busyRef.current -= 1;
    }
  }, [moveTo, cancelRest]);

  const runTurn = useCallback(
    async (turn: DialogTurn) => {
      if (stageRef.current !== "session") return;
      if (turn.say) setLastSpoken(turn.say);
      const ending = !turn.expectReply || turn.actions.some((a) => a.type === "end");
      const lang = turn.lang;
      await Promise.all([speak(turn.say, lang), runActions(turn.actions)]);
      if (ending) {
        await sleep(250);
        await endSession();
        return;
      }
      idleStatus();
    },
    [speak, runActions, endSession, idleStatus],
  );
  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  const handleText = useCallback(
    (text: string, language?: string) => {
      const t = text.trim();
      if (!t || stageRef.current !== "session") return;
      queueRef.current = queueRef.current.then(async () => {
        const dlg = dialogRef.current;
        if (!dlg || stageRef.current !== "session") return;
        setMood("thinking");
        setStatus(tr("Thinking…"));
        engineRef.current?.interrupt();
        await runTurnRef.current(handleAny(dlg, t, language));
      });
    },
    [tr],
  );

  const onUtterance = useCallback(
    async (wav: Blob) => {
      if (mutedRef.current || stageRef.current !== "session") return;
      setMood("thinking");
      setStatus(tr("Thinking…"));
      let res: { text: string; language?: string } = { text: "" };
      try {
        res = await transcribeAny(wav);
      } catch {
        showHint(tr("Couldn't reach the voice service."));
      }
      const text = (res.text || "").trim();
      if (!text) {
        idleStatus();
        return;
      }
      handleText(text, res.language);
    },
    [tr, showHint, idleStatus, handleText],
  );

  // ---------- start session ----------
  /** Start mic capture + playback (needs a user gesture in most browsers). */
  const startEngine = useCallback(async () => {
    const engine = audio.createAudioEngine();
    engineRef.current = engine;
    try {
      await engine.start({
        onUtterance: (wav: Blob) => void onUtterance(wav),
        onLevel: (rms: number) => {
          if (moodRef.current !== "listening") return;
          const now = performance.now();
          if (now - levelTick.current < 70) return; // throttle re-renders
          levelTick.current = now;
          setLevel(Math.min(1, rms * 9));
        },
        onSpeechStart: () => {
          if (engine.isSpeaking()) engine.interrupt();
        },
        onIdleHint: () => showHint(tr("I'm listening. Please speak a little louder."), 4000),
      });
      setMicAvailable(true);
      return true;
    } catch {
      setMicAvailable(false);
      showHint(tr("Microphone unavailable. Allow mic access to talk to me."));
      return false;
    }
  }, [tr, onUtterance, showHint]);

  const makeDialog = useCallback(
    () =>
      createDialog({
        userName,
        pathname: () => pathRef.current || window.location.pathname,
        intakeStep: () => readIntakeStepForDialog(),
      }),
    [userName],
  );

  const startSession = useCallback(async () => {
    if (stageRef.current === "session") return;
    stageRef.current = "session";
    setStage("session");
    setMuted(false);
    mutedRef.current = false;
    setStatus(tr("Connecting…"));
    setMood("thinking");
    await sleep(30);
    await moveTo(dockPos(), 700);

    const dialog = makeDialog();
    lastStepRef.current = readIntakeStepForDialog();
    announcedStepRef.current = lastStepRef.current;
    dialogRef.current = dialog;
    await startEngine();
    if (stageRef.current !== "session") return;
    const greet = dialog.greet();
    queueRef.current = queueRef.current.then(() => runTurnRef.current(greet));
  }, [tr, moveTo, makeDialog, startEngine]);

  /** Resume a call after a full page load: same conversation state, same spot on screen. */
  const resumeSession = useCallback(
    async (saved: SavedSession) => {
      if (stageRef.current === "session") return;
      const dialog = makeDialog();
      if (!dialog.restore?.(saved.snap)) {
        clearSavedSession();
        return;
      }
      stageRef.current = "session";
      setStage("session");
      setMuted(saved.muted);
      mutedRef.current = saved.muted;
      setPos(clampPos(saved.pos));
      dialogRef.current = dialog;
      // Let the step poller announce whatever step the page is on now.
      lastStepRef.current = null;
      announcedStepRef.current = null;
      if (!audioCanAutoplay()) {
        needsTapRef.current = true;
        setMood("idle");
        setStatus(tr("Tap the cap to continue our conversation."));
        showHint(tr("Tap the cap to continue our conversation."), 60000);
        return;
      }
      await startEngine();
      if (stageRef.current === "session") idleStatus();
    },
    [tr, makeDialog, startEngine, showHint, idleStatus],
  );

  useEffect(() => {
    if (!mounted || resumedRef.current) return;
    // Deferred so it runs once even under StrictMode's double effects.
    const t = setTimeout(() => {
      if (resumedRef.current) return;
      resumedRef.current = true;
      const saved = readSavedSession(userName);
      if (saved) void resumeSession(saved);
    }, 0);
    return () => clearTimeout(t);
  }, [mounted, userName, resumeSession]);

  // ---------- persist the active call so it survives reloads ----------
  useEffect(() => {
    if (stage !== "session") return;
    const persist = () => {
      const dlg = dialogRef.current;
      if (stageRef.current !== "session" || !dlg?.serialize) return;
      try {
        const saved: SavedSession = { at: Date.now(), user: userName, snap: dlg.serialize(), pos: posRef.current, muted: mutedRef.current };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
      } catch {
        /* storage blocked */
      }
    };
    persist();
    const iv = setInterval(persist, 1000);
    window.addEventListener("pagehide", persist);
    return () => {
      clearInterval(iv);
      window.removeEventListener("pagehide", persist);
    };
  }, [stage, userName]);

  // ---------- manual navigation: glide to the matching sidebar link and stay ----------
  useEffect(() => {
    if (stageRef.current !== "session") return;
    const nav = assistantNavRef.current;
    if (nav && Date.now() - nav.at < 10000 && (pathname === nav.href || pathname.startsWith(nav.href + "/") || nav.href.startsWith(pathname))) {
      return; // the assistant started this navigation; it already perched at the link
    }
    if (busyRef.current > 0) return; // a voice action (e.g. submit → redirect) caused this navigation
    automationRef.current?.abort(); // never keep typing into the previous page
    cancelRest();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled || stageRef.current !== "session" || busyRef.current > 0) return;
      cancelRest();
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("aside a[href^='/'], nav a[href^='/']"));
      let best: HTMLAnchorElement | null = null;
      let bestLen = -1;
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const match = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
        if (match && href.length > bestLen && a.getBoundingClientRect().width > 0) {
          best = a;
          bestLen = href.length;
        }
      }
      const size = 100;
      if (best) {
        const r = best.getBoundingClientRect();
        await moveTo({ x: r.right + 10, y: r.top + r.height / 2 - mascotHeight(size) / 2, size }, 650);
      } else {
        const { w } = viewport();
        await moveTo({ x: w - size - 220, y: 72, size }, 650);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathname, moveTo, cancelRest]);

  // ---------- intake wizard: announce a newly reached step once ----------
  useEffect(() => {
    if (stage !== "session") return;
    let flushing = false;
    const iv = setInterval(async () => {
      const dlg = dialogRef.current;
      if (!dlg || stageRef.current !== "session" || flushing || needsTapRef.current) return;
      if (automationRef.current?.hasPending() && readIntakeStepForDialog() === "capture") {
        flushing = true;
        busyRef.current += 1;
        try {
          await automationRef.current.flushPending();
        } finally {
          busyRef.current -= 1;
          flushing = false;
        }
      }
      const st = readIntakeStepForDialog();
      if (st === lastStepRef.current) return;
      lastStepRef.current = st;
      if (!st || st === announcedStepRef.current) return;
      announcedStepRef.current = st;
      const turn = dlg.onIntakeStep?.(st) ?? null;
      if (turn) queueRef.current = queueRef.current.then(() => runTurnRef.current(turn));
    }, 600);
    return () => clearInterval(iv);
  }, [stage]);

  // open from anywhere
  useEffect(() => {
    const open = () => {
      if (stageRef.current === "session") return;
      void startSession();
    };
    window.addEventListener(VOICE_EVENTS.open, open);
    return () => window.removeEventListener(VOICE_EVENTS.open, open);
  }, [startSession]);

  // Dev-only text hook for automated tests (no mic in headless browsers).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__voiceTest = (text: string) => handleText(text);
    window.__voiceFields = () => readVoiceFields() as Record<string, string>;
    window.__voiceAdvance = async (step?: string) =>
      (await automationRef.current?.advanceIntake(step)) ?? { ok: false, detail: "no-automation" };
    return () => {
      delete window.__voiceTest;
      delete window.__voiceFields;
      delete window.__voiceAdvance;
    };
  }, [handleText]);

  // Esc ends the session / closes the bubble
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stageRef.current === "session") void endSession();
      else if (stageRef.current === "intro") {
        setStage("home");
        void moveTo(homePos(), 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endSession, moveTo]);

  // release mic / timers on unmount
  useEffect(
    () => () => {
      engineRef.current?.stop();
      if (speakAnim.current) clearInterval(speakAnim.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const toggleMute = () => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (m) engineRef.current?.interrupt();
    idleStatus();
  };

  const onMascotClick = async () => {
    if (stage === "session" && needsTapRef.current) {
      // First tap after a reload unlocks audio + mic; the step poller then announces the current step.
      needsTapRef.current = false;
      setHint("");
      await startEngine();
      if (stageRef.current === "session") idleStatus();
      return;
    }
    if (stage === "session") {
      // Tap the cap while it talks to cut it short.
      if (engineRef.current?.isSpeaking()) engineRef.current.interrupt();
      return;
    }
    if (stage === "intro") return;
    await moveTo(centerPos(), 900);
    setStage("intro");
  };

  const later = async () => {
    setStage("home");
    await moveTo(homePos(), 800);
  };

  if (!mounted) return null;

  return (
    <>
      <MascotStyles />
      <Mascot
        ref={mascotRef}
        pos={pos}
        mood={stage === "session" ? mood : "idle"}
        level={level}
        moving={moving}
        tapKey={tapKey}
        reduced={reduced}
        faded={faded}
        label={stage === "session" ? `${tr("Voice assistant")}: ${status}` : tr("Open voice assistant")}
        onClick={() => void onMascotClick()}
      />
      {stage === "intro" && !moving && (
        <IntroBubble pos={pos} userName={userName} onTalk={() => void startSession()} onLater={() => void later()} />
      )}
      {stage === "session" && (
        <MascotControls
          pos={pos}
          muted={muted}
          micAvailable={micAvailable}
          moving={moving}
          reduced={reduced}
          faded={faded}
          onToggleMute={toggleMute}
          onEnd={() => void endSession()}
        />
      )}
      {stage === "session" && hint && <MascotHint pos={pos} text={hint} />}
      <SrLive status={stage === "session" ? status : ""} last={stage === "session" ? lastSpoken : ""} />
    </>
  );
}
