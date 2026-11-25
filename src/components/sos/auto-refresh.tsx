"use client";
/** Refreshes server-rendered data on an interval (used for live responder lists). */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [ms, router]);
  return null;
}
