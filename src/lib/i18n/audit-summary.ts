/**
 * Display-time translation of stored English audit / activity summaries.
 * Each template key in messages-audit.ts ("Draft version {v} saved ({n} field(s) edited)")
 * is compiled to a regex; the first (most specific) match is translated and its
 * captured values re-inserted. Captured values that are themselves known UI strings
 * (status labels, priorities, roles, "granted", …) are translated too; anything else
 * (names, references, titles) is shown as stored. Unknown summaries are returned unchanged.
 */
import { hiAudit, type AuditKey } from "./messages-audit";
import type { MsgKey, Tr } from "./messages";

interface Compiled {
  key: AuditKey;
  re: RegExp;
  names: string[];
}

let compiled: Compiled[] | null = null;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(): Compiled[] {
  const list = (Object.keys(hiAudit) as AuditKey[]).map((key) => {
    const names: string[] = [];
    const parts = key.split(/(\{\w+\})/);
    const src = parts
      .map((p) => {
        const m = /^\{(\w+)\}$/.exec(p);
        if (m) {
          names.push(m[1]);
          return "(.+?)";
        }
        return escapeRe(p);
      })
      .join("");
    const literal = parts.filter((p) => !/^\{\w+\}$/.test(p)).join("").length;
    return { key, re: new RegExp(`^${src}$`, "s"), names, literal };
  });
  // Most specific templates (more literal text) first.
  list.sort((a, b) => b.literal - a.literal);
  return list.map(({ key, re, names }) => ({ key, re, names }));
}

/** Translate a captured value if it is a known UI string (or a comma-separated list of them). */
function localizeValue(value: string, tr: Tr): string {
  const direct = tr(value as MsgKey);
  if (direct !== value) return direct;
  const lower = value.toLowerCase();
  const viaLower = tr(lower as MsgKey);
  if (viaLower !== lower) return viaLower;
  const cap = value.charAt(0).toUpperCase() + value.slice(1);
  const viaCap = tr(cap as MsgKey);
  if (viaCap !== cap) return viaCap;
  if (value.includes(", ")) {
    const parts = value.split(", ");
    const mapped = parts.map((p) => localizeValue(p, tr));
    if (mapped.some((m, i) => m !== parts[i])) return mapped.join(", ");
  }
  return value;
}

export function localizeAuditSummary(summary: string | null | undefined, tr: Tr): string {
  if (!summary) return "";
  // Fast path: the whole summary is a known UI string.
  const whole = tr(summary as MsgKey);
  if (whole !== summary) return whole;
  compiled ??= compile();
  for (const c of compiled) {
    if (c.names.length === 0) {
      if (summary === c.key) return tr(c.key);
      continue;
    }
    const m = c.re.exec(summary);
    if (!m) continue;
    const vars: Record<string, string> = {};
    c.names.forEach((n, i) => {
      vars[n] = localizeValue(m[i + 1], tr);
    });
    return tr(c.key, vars);
  }
  return summary;
}
