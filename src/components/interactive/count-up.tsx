"use client";
import { useEffect, useRef, useState } from "react";

/** Animated integer counter. Shows the final value immediately when reduced motion is preferred. */
export function CountUp({ value, duration = 700, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const d = reduce ? 0 : duration;
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = d === 0 ? 1 : Math.min(1, (t - start) / d);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(begin + (value - begin) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className} aria-label={String(value)}>
      <span aria-hidden>{shown.toLocaleString("en-IN")}</span>
    </span>
  );
}
