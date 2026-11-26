"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Table row that opens `href` on click or Enter. Clicks on interactive children
 * (links, buttons, inputs, labels) keep their own behaviour; ⌘/Ctrl-click opens a new tab.
 */
export function ClickableRow({ href, label, children, className = "" }: { href: string; label: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  const go = (newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener");
    else router.push(href);
  };
  return (
    <tr
      tabIndex={0}
      aria-label={label}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
        go(e.metaKey || e.ctrlKey);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          go(e.metaKey || e.ctrlKey);
        }
      }}
      className={`cursor-pointer transition-colors hover:bg-[#FAFAF7] focus-visible:bg-[#E7F6E9] focus-visible:outline-none ${className}`}
    >
      {children}
    </tr>
  );
}
