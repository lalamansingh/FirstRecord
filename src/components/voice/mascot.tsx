"use client";
/**
 * Presentational pieces of the voice assistant: the movable police-cap mascot,
 * the intro speech bubble, compact call controls attached to the mascot, a tiny
 * transient hint, and an sr-only live region. State lives in voice-assistant.tsx.
 */
import { forwardRef, useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { MascotArt, MASCOT_ASPECT, type MascotMood } from "./mascot-art";
import { useT } from "@/lib/i18n/client";

export interface MascotPos {
  x: number;
  y: number;
  size: number;
}

export const mascotHeight = (size: number) => size * MASCOT_ASPECT;

export const Mascot = forwardRef<HTMLButtonElement, {
  pos: MascotPos;
  mood: MascotMood;
  level: number;
  moving: boolean;
  tapKey: number;
  reduced: boolean;
  /** reduced-motion "fade-move": hidden while the position jumps */
  faded?: boolean;
  label: string;
  onClick: () => void;
}>(function Mascot({ pos, mood, level, moving, tapKey, reduced, faded, label, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      data-fr-mascot=""
      className="group fixed left-0 top-0 z-[70] rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[#9DF0C4]/70"
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        width: pos.size,
        height: mascotHeight(pos.size),
        opacity: faded ? 0 : 1,
        transition: reduced
          ? "opacity 200ms ease"
          : moving
            ? "transform 900ms cubic-bezier(.34,1.45,.64,1), width 900ms cubic-bezier(.34,1.45,.64,1), height 900ms cubic-bezier(.34,1.45,.64,1)"
            : "transform 600ms cubic-bezier(.34,1.3,.64,1), width 600ms ease, height 600ms ease",
        filter: "drop-shadow(0 8px 16px rgb(17 18 22 / 0.22)) drop-shadow(0 2px 4px rgb(17 18 22 / 0.12))",
      }}
    >
      <span key={tapKey} className={tapKey ? "fr-mascot-tap block" : "block"}>
        <MascotArt mood={mood} level={level} size={pos.size} />
      </span>
    </button>
  );
});

/** Speech bubble shown next to the mascot (intro / reopen). */
export function IntroBubble({ pos, onTalk, onLater, userName }: { pos: MascotPos; onTalk: () => void; onLater: () => void; userName: string }) {
  const tr = useT();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
  }, []);
  const width = 300;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const left = Math.max(12, Math.min(vw - width - 12, pos.x + pos.size / 2 - width / 2));
  const top = pos.y + mascotHeight(pos.size) + 14;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="fr-voice-intro-title"
      className="fr-mascot-pop fixed z-[71] rounded-[18px] border border-[#E6E4DE] bg-white p-5 shadow-[0_12px_32px_rgb(17_18_22/0.12)]"
      style={{ left, top, width }}
    >
      <p id="fr-voice-intro-title" className="text-[15px] font-semibold tracking-[-0.01em] text-[#111216]">
        {tr("Hi {name}! I'm your FirstRecord assistant.", { name: userName })}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#4E545A]">
        {tr("I can open pages, fill forms and find cases. Just talk to me in Hindi or English.")}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          ref={btn}
          type="button"
          onClick={onTalk}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#111216] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#2A2C33] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#9DF0C4]/70"
        >
          <Mic className="h-4 w-4" aria-hidden />
          {tr("Talk to me")}
        </button>
        <button type="button" onClick={onLater} className="text-[13px] font-medium text-[#5B5E66] underline-offset-4 hover:text-[#111216] hover:underline">
          {tr("Later")}
        </button>
      </div>
    </div>
  );
}

/** Two small round buttons attached to the left of the mascot during a call. */
export function MascotControls({
  pos,
  muted,
  micAvailable,
  moving,
  reduced,
  faded,
  onToggleMute,
  onEnd,
}: {
  pos: MascotPos;
  muted: boolean;
  micAvailable: boolean;
  moving: boolean;
  reduced: boolean;
  faded?: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
}) {
  const tr = useT();
  const h = mascotHeight(pos.size);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  // Prefer the left side of the cap; flip to the right when the mascot is near the left edge.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const onLeft = pos.x > 120;
  const x = onLeft ? pos.x - 50 : pos.x + pos.size + 10;
  const y = pos.y + h / 2 - 42;
  return (
    <div
      role="group"
      aria-label={tr("Voice assistant")}
      data-fr-mascot=""
      className="fixed left-0 top-0 z-[71] flex flex-col gap-2"
      style={{
        transform: `translate3d(${Math.max(8, Math.min(vw - 48, x))}px, ${Math.max(8, Math.min(vh - 92, y))}px, 0)`,
        opacity: faded ? 0 : 1,
        transition: reduced ? "opacity 200ms ease" : moving ? "transform 900ms cubic-bezier(.34,1.45,.64,1)" : "transform 600ms cubic-bezier(.34,1.3,.64,1)",
      }}
    >
      <button
        type="button"
        onClick={onToggleMute}
        disabled={!micAvailable}
        aria-pressed={muted}
        aria-label={muted ? tr("Unmute microphone") : tr("Mute microphone")}
        title={muted ? tr("Unmute microphone") : tr("Mute microphone")}
        className="fr-mascot-pop grid h-9 w-9 place-items-center rounded-full border border-[#E6E4DE] bg-white text-[#111216] shadow-[0_4px_12px_rgb(17_18_22/0.14)] transition hover:border-[#D7D2CC] hover:bg-[#FAFAF7] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#9DF0C4]/70 disabled:opacity-40"
      >
        {muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={onEnd}
        aria-label={tr("End call")}
        title={tr("End call")}
        className="fr-mascot-pop grid h-9 w-9 place-items-center rounded-full bg-[#B42318] text-white shadow-[0_4px_12px_rgb(180_35_24/0.35)] transition hover:bg-[#912018] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B42318]/30"
      >
        <PhoneOff className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Tiny transient hint near the mascot (errors such as "mic unavailable"). */
export function MascotHint({ pos, text }: { pos: MascotPos; text: string }) {
  const width = 230;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const left = Math.max(12, Math.min(vw - width - 12, pos.x + pos.size / 2 - width / 2));
  return (
    <p
      className="fr-mascot-pop fixed z-[71] rounded-[12px] bg-[#111216] px-3 py-2 text-center text-[12px] leading-snug text-white shadow-[0_8px_20px_rgb(17_18_22/0.2)]"
      style={{ left, top: Math.max(8, pos.y - 46), width }}
    >
      {text}
    </p>
  );
}

/** Screen-reader-only live captions (nothing visible). */
export function SrLive({ status, last }: { status: string; last: string }) {
  return (
    <div className="sr-only">
      <p aria-live="polite">{status}</p>
      <p aria-live="polite">{last}</p>
    </div>
  );
}
