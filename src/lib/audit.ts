/**
 * Application audit log (append-only at the application layer via DB triggers).
 * This is an operational audit trail — NOT a certified, tamper-proof evidence
 * integrity mechanism. Summaries and metadata must never contain statement
 * content, transcripts or other narrative text.
 */
import { insert, newId, now } from "@/lib/db";

export interface AuditInput {
  actorId: string | null;
  action: string; // e.g. "case.status_changed"
  entityType: string; // e.g. "case"
  entityId?: string | null;
  caseId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

const SENSITIVE_KEYS = /(text|transcript|narrative|password|token|secret|body|content|statement)/i;

/** Strip anything that looks like content from metadata before logging. */
export function redactMetadata(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 200) {
      out[k] = v.slice(0, 200) + "…";
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function audit(input: AuditInput) {
  insert("audit_events", {
    id: newId(),
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    case_id: input.caseId ?? null,
    summary: input.summary.slice(0, 500),
    metadata: JSON.stringify(redactMetadata(input.metadata)),
    ip: input.ip ?? null,
    created_at: now(),
  });
}

export function recordAccess(input: {
  userId: string;
  entityType: string;
  entityId: string;
  caseId?: string | null;
  action: "view" | "download" | "export" | "play";
  ip?: string | null;
}) {
  insert("record_access_events", {
    id: newId(),
    user_id: input.userId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    case_id: input.caseId ?? null,
    action: input.action,
    ip: input.ip ?? null,
    created_at: now(),
  });
}
