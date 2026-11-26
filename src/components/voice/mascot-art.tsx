"use client";
/**
 * FirstRecord साथी — an original, friendly Indian-style police peaked cap (inline SVG).
 * Khaki crown, red band with gold piping, gold star-and-wreath badge, glossy black
 * visor and chin strap — no real emblem, insignia or text. Cute blinking eyes peek
 * out under the brim. Pure presentational component.
 */
import { useEffect, useId, useState } from "react";

export type MascotMood = "idle" | "listening" | "thinking" | "speaking" | "sleeping";

/** height / width of the artwork */
export const MASCOT_ASPECT = 150 / 160;

export function MascotArt({ mood = "idle", level = 0, size = 72 }: { mood?: MascotMood; level?: number; size?: number }) {
  const [blink, setBlink] = useState(false);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    if (mood === "sleeping") return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, 2600 + Math.random() * 2400);
    };
    loop();
    return () => clearTimeout(t);
  }, [mood]);

  const lv = Math.max(0, Math.min(1, level));
  const eyeY = mood === "listening" ? 110 : 113;
  const eyeRy = mood === "sleeping" || blink ? 0.9 : 7;
  const id = (n: string) => `${n}-${uid}`;

  return (
    <svg
      viewBox="0 0 160 150"
      width={size}
      height={size * MASCOT_ASPECT}
      aria-hidden
      className={mood === "idle" || mood === "listening" ? "fr-mascot-bob" : undefined}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={id("crown")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D8BC82" />
          <stop offset="0.55" stopColor="#C9A86A" />
          <stop offset="1" stopColor="#A88A4F" />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F5D27A" />
          <stop offset="0.5" stopColor="#E0B24C" />
          <stop offset="1" stopColor="#B8860B" />
        </linearGradient>
        <linearGradient id={id("visor")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A2A2A" />
          <stop offset="0.6" stopColor="#141414" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id={id("band")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9352B" />
          <stop offset="1" stopColor="#9C1F18" />
        </linearGradient>
      </defs>

      {/* faint mint halo (idle / listening) */}
      {(mood === "idle" || mood === "listening") && <circle cx="80" cy="72" r="70" fill="#9DF0C4" opacity="0.22" />}
      {/* listening: pulse ring + a ring that grows with the mic level, so users SEE it hears them */}
      {mood === "listening" && (
        <>
          <circle cx="80" cy="72" r="70" fill="none" stroke="#19C37D" strokeWidth="3.5" className="fr-mascot-pulse" />
          <circle
            cx="80"
            cy="72"
            r={64 + lv * 16}
            fill="none"
            stroke="#19C37D"
            strokeWidth={2 + lv * 5}
            opacity={0.25 + lv * 0.65}
            style={{ transition: "r 90ms linear, stroke-width 90ms linear, opacity 90ms linear" }}
          />
        </>
      )}

      {/* ground shadow */}
      <ellipse cx="80" cy="144" rx="44" ry="5" fill="#111216" opacity="0.12" />

      {/* crown (flared top of a peaked cap) */}
      <path d="M24 62 C 8 36, 40 12, 80 12 C 120 12, 152 36, 136 62 Z" fill={`url(#${id("crown")})`} />
      {/* crown shading + seam */}
      <path d="M24 62 C 30 52, 130 52, 136 62 Z" fill="#A88A4F" opacity="0.55" />
      <path d="M80 14 C 79 30, 79 44, 80 56" stroke="#A88A4F" strokeWidth="1.4" opacity="0.6" fill="none" />
      {/* top highlight */}
      <path d="M40 30 C 58 18, 102 18, 120 30" stroke="#F1E2BC" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.75" />

      {/* red band with gold piping */}
      <rect x="32" y="60" width="96" height="18" rx="3" fill={`url(#${id("band")})`} />
      <rect x="32" y="60" width="96" height="2.2" fill="#D4A537" />
      <rect x="32" y="75.8" width="96" height="2.2" fill="#D4A537" />

      {/* gold badge: wreath + star (original, no real emblem) */}
      <g transform="translate(80 50)">
        <circle r="15.5" fill={`url(#${id("gold")})`} stroke="#8F6A0E" strokeWidth="1.2" />
        <g fill="none" stroke="#8F6A0E" strokeWidth="1.6" strokeLinecap="round">
          <path d="M-9 6 C -13 0, -12 -7, -7 -11" />
          <path d="M9 6 C 13 0, 12 -7, 7 -11" />
        </g>
        <g fill="#8F6A0E">
          <ellipse cx="-11" cy="-2" rx="2.2" ry="1.2" transform="rotate(-60 -11 -2)" />
          <ellipse cx="-10" cy="3.5" rx="2.2" ry="1.2" transform="rotate(-30 -10 3.5)" />
          <ellipse cx="11" cy="-2" rx="2.2" ry="1.2" transform="rotate(60 11 -2)" />
          <ellipse cx="10" cy="3.5" rx="2.2" ry="1.2" transform="rotate(30 10 3.5)" />
        </g>
        <path d="M0 -8 L2.4 -2.6 L8 -2.2 L3.7 1.4 L5 7 L0 4 L-5 7 L-3.7 1.4 L-8 -2.2 L-2.4 -2.6 Z" fill="#FFF4D2" stroke="#8F6A0E" strokeWidth="0.8" />
      </g>

      {/* chin strap with gold buttons */}
      <rect x="34" y="73" width="92" height="4.4" rx="2.2" fill="#141414" />
      <circle cx="35" cy="75" r="4" fill={`url(#${id("gold")})`} stroke="#8F6A0E" strokeWidth="0.8" />
      <circle cx="125" cy="75" r="4" fill={`url(#${id("gold")})`} stroke="#8F6A0E" strokeWidth="0.8" />

      {/* glossy black visor / peak */}
      <path d="M28 78 C 50 100, 110 100, 132 78 L 136 82 C 114 108, 46 108, 24 82 Z" fill={`url(#${id("visor")})`} />
      {/* specular highlight (pulses with speech) */}
      <path
        d="M46 88 C 62 95, 98 95, 114 88"
        stroke="#FFFFFF"
        strokeWidth={mood === "speaking" ? 2.2 + lv * 3 : 2.2}
        strokeLinecap="round"
        fill="none"
        opacity={mood === "speaking" ? 0.45 + lv * 0.5 : 0.55}
      />

      {/* eyes under the brim */}
      <ellipse cx="62" cy={eyeY + 6} rx="6.5" ry={eyeRy} fill="#111216" />
      <ellipse cx="98" cy={eyeY + 6} rx="6.5" ry={eyeRy} fill="#111216" />
      {eyeRy > 2 && (
        <>
          <circle cx="64.5" cy={eyeY + 3} r="2" fill="#FFFFFF" />
          <circle cx="100.5" cy={eyeY + 3} r="2" fill="#FFFFFF" />
        </>
      )}

      {/* mouth */}
      {mood === "speaking" ? (
        <ellipse cx="80" cy="134" rx={5.5 + lv * 2.5} ry={1.5 + lv * 5} fill="#111216" />
      ) : mood === "sleeping" ? (
        <path d="M74 133 Q80 135 86 133" stroke="#111216" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M72 131 Q80 138 88 131" stroke="#111216" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      )}

      {/* thinking dots above the cap */}
      {mood === "thinking" && (
        <g fill="#111216">
          <circle cx="66" cy="2" r="4" className="fr-mascot-dot" style={{ animationDelay: "0ms" }} />
          <circle cx="80" cy="0" r="4" className="fr-mascot-dot" style={{ animationDelay: "150ms" }} />
          <circle cx="94" cy="2" r="4" className="fr-mascot-dot" style={{ animationDelay: "300ms" }} />
        </g>
      )}
      {mood === "sleeping" && (
        <text x="136" y="18" fontSize="16" fill="#A7B0AC" fontFamily="var(--font-mono, monospace)">z</text>
      )}
    </svg>
  );
}

/** Keyframes for the mascot (scoped class names, injected once). */
export function MascotStyles() {
  return (
    <style>{`
@keyframes fr-mascot-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@keyframes fr-mascot-pulse { 0% { opacity: .85; transform: scale(.9) } 100% { opacity: 0; transform: scale(1.16) } }
@keyframes fr-mascot-dot { 0%,80%,100% { opacity: .2; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-2px) } }
@keyframes fr-mascot-tap { 0% { transform: scale(1) } 40% { transform: scale(.86) } 100% { transform: scale(1) } }
@keyframes fr-mascot-pop { 0% { opacity: 0; transform: translateY(8px) scale(.96) } 100% { opacity: 1; transform: none } }
.fr-mascot-bob { animation: fr-mascot-bob 2.4s ease-in-out infinite; }
.fr-mascot-pulse { transform-origin: 80px 72px; transform-box: view-box; animation: fr-mascot-pulse 1.4s ease-out infinite; }
.fr-mascot-dot { animation: fr-mascot-dot 1s ease-in-out infinite; }
.fr-mascot-tap { animation: fr-mascot-tap .35s ease-out; }
.fr-mascot-pop { animation: fr-mascot-pop .28s ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .fr-mascot-bob, .fr-mascot-pulse, .fr-mascot-dot, .fr-mascot-tap, .fr-mascot-pop { animation: none !important; }
}
`}</style>
  );
}
