/** Display formatting helpers (safe for client and server). Pass `lang` to localize. */
import { t } from "./i18n/messages";

/** Intl locale for an interface language code. */
export function localeFor(lang?: string): string {
  return !lang || lang === "en" ? "en-IN" : `${lang}-IN`;
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PARTY_ROLE_LABELS: Record<string, string> = {
  complainant: "Complainant",
  witness: "Witness",
  involved: "Involved party",
  other: "Other",
};

export const CAPTURE_METHOD_LABELS: Record<string, string> = {
  typed: "Typed statement",
  audio: "Audio recording",
  video: "Video recording",
  assisted: "Staff-assisted entry",
  accessible: "Accessible alternative",
};

export const OFFICIAL_STATUS_LABELS: Record<string, { label: string; description: string }> = {
  local: {
    label: "Local record only",
    description: "Stored in FirstRecord only. Not submitted to or filed with any official system.",
  },
  submitted: {
    label: "Submitted (awaiting confirmation)",
    description: "Recorded as submitted to an external system. Official filing is not confirmed.",
  },
  filed: {
    label: "Officially filed (confirmed)",
    description: "Filing confirmed by an authorized external system response.",
  },
};

export const DRAFT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft — not reviewed",
  clarification_requested: "Clarification requested",
  reviewed: "Reviewed by officer (not filed)",
};

export function formatDate(iso: string | null | undefined, opts: { time?: boolean; lang?: string } = {}): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(localeFor(opts.lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(opts.time ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}

export function formatRelative(iso: string | null | undefined, lang = "en"): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  const abs = Math.abs(diff);
  const future = diff < 0;
  const m = Math.round(abs / 60000);
  if (m < 1) return t(lang, "just now");
  let n: number;
  let unit: "min" | "h" | "d";
  if (m < 60) [n, unit] = [m, "min"];
  else if (m < 60 * 24) [n, unit] = [Math.round(m / 60), "h"];
  else if (m < 60 * 24 * 30) [n, unit] = [Math.round(m / 1440), "d"];
  else return formatDate(iso, { lang });
  if (future) return t(lang, unit === "min" ? "in {n} min" : unit === "h" ? "in {n} h" : "in {n} d", { n });
  return t(lang, unit === "min" ? "{n} min ago" : unit === "h" ? "{n} h ago" : "{n} d ago", { n });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** For <input type="datetime-local"> values. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function isOverdue(due: string | null | undefined, completed?: string | null) {
  return !!due && !completed && Date.parse(due) < Date.now();
}
