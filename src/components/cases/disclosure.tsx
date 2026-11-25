"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";

/** Accessible show/hide panel for inline forms. */
export function Disclosure({
  label,
  children,
  variant = "secondary",
  size,
  defaultOpen = false,
  className,
}: {
  label: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        className={buttonClass(variant, size)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="mt-3">
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
