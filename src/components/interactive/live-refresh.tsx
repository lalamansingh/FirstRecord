"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** "Live" indicator + refresh button. Also refreshes quietly every `intervalMs` while the tab is visible. */
export function LiveRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stamp, setStamp] = useState(() => Date.now());

  const refresh = () =>
    start(() => {
      router.refresh();
      setStamp(Date.now());
    });

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
        setStamp(Date.now());
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, router]);

  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F6E9] px-2 py-0.5 text-[11px] font-medium text-[#0F7A4C]" title={new Date(stamp).toLocaleTimeString()}>
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#19C37D] opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#19C37D]" />
        </span>
        {tr("Live")}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        aria-label={pending ? tr("Refreshing…") : tr("Refresh")}
        title={tr("Refresh")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#E6E4DE] bg-white text-[#111216] transition-colors hover:bg-[#9DF0C4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111216] disabled:opacity-60"
      >
        <RotateCw className={`h-3.5 w-3.5 ${pending ? "motion-safe:animate-spin" : ""}`} aria-hidden />
      </button>
    </span>
  );
}
