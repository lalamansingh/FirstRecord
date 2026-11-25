/**
 * Duplicate detection suggestions. These are hints for a human to inspect —
 * records are NEVER merged automatically.
 */
import { all } from "@/lib/db";
import { caseVisibilityFilter, type AuthUser } from "@/lib/rbac/access";

export interface DuplicateSuggestion {
  id: string;
  reference: string;
  title: string;
  reason: string;
  /** Individual English reasons, for render-time translation (formatDuplicateReason). */
  reasons: string[];
}

export function normalizeName(n: string) {
  return n
    .toLowerCase()
    .replace(/\(demo\)/g, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePhone(p: string) {
  const d = p.replace(/\D+/g, "");
  return d.length >= 7 ? d.slice(-10) : "";
}

export function findPossibleDuplicates(
  user: AuthUser,
  q: {
    stationId: string;
    incidentType?: string | null;
    incidentDate?: string | null;
    names?: string[];
    phones?: string[];
    excludeCaseId?: string;
  },
): DuplicateSuggestion[] {
  const f = caseVisibilityFilter(user);
  const results = new Map<string, DuplicateSuggestion>();
  const add = (row: { id: string; reference: string; title: string }, reason: string) => {
    if (row.id === q.excludeCaseId) return;
    const existing = results.get(row.id);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else results.set(row.id, { ...row, reason, reasons: [reason] });
  };

  // 1. Same station + same incident type within ±7 days
  if (q.incidentType && q.incidentDate && !Number.isNaN(Date.parse(q.incidentDate))) {
    const d = Date.parse(q.incidentDate);
    const from = new Date(d - 7 * 86400e3).toISOString();
    const to = new Date(d + 7 * 86400e3).toISOString();
    const rows = all<{ id: string; reference: string; title: string; incident_date: string }>(
      `SELECT c.id, c.reference, c.title, c.incident_date FROM cases c
        WHERE c.station_id = ? AND lower(c.incident_type) = lower(?) AND c.incident_date IS NOT NULL
          AND c.incident_date BETWEEN ? AND ? AND ${f.sql}
        ORDER BY c.incident_date DESC LIMIT 20`,
      q.stationId,
      q.incidentType,
      from,
      to,
      ...f.params,
    );
    for (const r of rows) {
      const days = Math.round(Math.abs(Date.parse(r.incident_date) - d) / 86400e3);
      add(r, days === 0 ? "Same incident type on the same day" : days === 1 ? "Same incident type within 1 day" : `Same incident type within ${days} days`);
    }
  }

  // 2/3. Party names and phones (normalized in JS for robustness)
  const names = new Set((q.names ?? []).map(normalizeName).filter((n) => n.length >= 3));
  const phones = new Set((q.phones ?? []).map(normalizePhone).filter(Boolean));
  if (names.size || phones.size) {
    const rows = all<{ id: string; reference: string; title: string; name: string; phone: string | null }>(
      `SELECT c.id, c.reference, c.title, p.name, p.phone FROM case_parties p JOIN cases c ON c.id = p.case_id
        WHERE ${f.sql} ORDER BY c.updated_at DESC LIMIT 2000`,
      ...f.params,
    );
    for (const r of rows) {
      if (names.size && names.has(normalizeName(r.name))) add(r, "Matching party name");
      if (phones.size && r.phone && phones.has(normalizePhone(r.phone))) add(r, "Matching party phone number");
    }
  }

  return [...results.values()].slice(0, 10).map(({ id, reference, title, reasons }) => ({
    id,
    reference,
    title,
    reason: reasons.join("; "),
    reasons,
  }));
}

/** Translate a duplicate-match reason produced above (stored/generated in English). */
export function formatDuplicateReason(tr: (key: string, vars?: Record<string, string | number>) => string, reason: string): string {
  const m = /^Same incident type within (\d+) days$/.exec(reason);
  return m ? tr("Same incident type within {n} days", { n: Number(m[1]) }) : tr(reason);
}
