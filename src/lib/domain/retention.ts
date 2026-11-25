/**
 * Retention workflows.
 *
 *  - Policies are configurable per record type (settings.retention).
 *  - "flag_for_review": items past retention are listed for an authorized user
 *    (data.delete) to delete individually, with a reason. Nothing is deleted automatically.
 *  - "delete": items past retention are purged automatically (CLI or admin run).
 *  - Audit events are never deleted by retention.
 *  - Closed cases are only ever flagged: FirstRecord does not destroy case records;
 *    that must follow the organization's approved records-destruction procedure.
 *
 * These mechanics do not establish legal compliance; retention periods must be
 * set by authorized policy for the jurisdiction.
 */
import { all, get, now, run, update, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { can, type AuthUser } from "@/lib/rbac/access";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export type RetentionRecordType = "recording" | "attachment" | "closed_case" | "notification" | "session";

export const RETENTION_TYPES: Record<RetentionRecordType, { label: string; allowDelete: boolean; reviewable: boolean }> = {
  recording: { label: "Statement recordings", allowDelete: true, reviewable: true },
  attachment: { label: "Attachments", allowDelete: true, reviewable: true },
  closed_case: { label: "Closed cases", allowDelete: false, reviewable: true },
  notification: { label: "Notifications", allowDelete: true, reviewable: false },
  session: { label: "Session records", allowDelete: true, reviewable: false },
};

export interface RetentionPolicy {
  id: string;
  record_type: RetentionRecordType;
  retention_days: number;
  action: "flag_for_review" | "delete";
  description: string;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
}

export function listPolicies(): RetentionPolicy[] {
  return all<RetentionPolicy>(
    `SELECT p.id, p.record_type, p.retention_days, p.action, p.description, p.updated_by, u.name AS updated_by_name, p.updated_at
       FROM retention_policies p LEFT JOIN users u ON u.id = p.updated_by ORDER BY p.record_type`,
  );
}

function cutoff(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export function updatePolicy(actor: AuthUser, id: string, days: number, action: "flag_for_review" | "delete", ip: string | null) {
  if (!can(actor, "settings.retention")) throw new ForbiddenError();
  const p = get<RetentionPolicy>("SELECT * FROM retention_policies WHERE id = ?", id);
  if (!p) throw new NotFoundError("Policy not found.");
  const meta = RETENTION_TYPES[p.record_type];
  if (action === "delete" && !meta?.allowDelete) {
    throw new ValidationError(`${meta?.label ?? p.record_type} can only be flagged for review.`);
  }
  if (!Number.isInteger(days) || days < 1 || days > 36500) throw new ValidationError("Retention must be between 1 and 36500 days.");
  if (p.retention_days === days && p.action === action) return;
  update("retention_policies", id, { retention_days: days, action, updated_by: actor.id, updated_at: now() });
  audit({
    actorId: actor.id,
    action: "settings.retention_changed",
    entityType: "retention_policy",
    entityId: id,
    summary: `Retention for ${p.record_type} changed: ${p.retention_days}d/${p.action} → ${days}d/${action}`,
    ip,
  });
}

export interface FlaggedItem {
  type: "recording" | "attachment" | "closed_case";
  id: string;
  label: string;
  caseId: string | null;
  caseReference: string | null;
  date: string;
  sizeBytes: number | null;
}

/** Station scope for retention review: station-bound users only see their station's items. */
function stationClause(actor: AuthUser, col: string): { sql: string; params: string[] } {
  if (!actor.stationId || can(actor, "case.view.all")) return { sql: "1=1", params: [] };
  return { sql: `${col} = ?`, params: [actor.stationId] };
}

export function findFlagged(actor: AuthUser, limit = 200): FlaggedItem[] {
  const policies = listPolicies();
  const items: FlaggedItem[] = [];
  for (const p of policies) {
    if (p.action !== "flag_for_review") continue;
    const c = cutoff(p.retention_days);
    if (p.record_type === "recording") {
      const sc = stationClause(actor, "s.station_id");
      for (const r of all<{ id: string; kind: string; created_at: string; size_bytes: number; case_id: string | null; reference: string | null }>(
        `SELECT r.id, r.kind, r.created_at, r.size_bytes, s.case_id, cs.reference
           FROM recordings r JOIN statements s ON s.id = r.statement_id LEFT JOIN cases cs ON cs.id = s.case_id
          WHERE r.status = 'stored' AND r.created_at < ? AND ${sc.sql} ORDER BY r.created_at LIMIT ?`,
        c,
        ...sc.params,
        limit,
      )) {
        items.push({ type: "recording", id: r.id, label: `${r.kind === "video" ? "Video" : "Audio"} recording`, caseId: r.case_id, caseReference: r.reference, date: r.created_at, sizeBytes: r.size_bytes });
      }
    } else if (p.record_type === "attachment") {
      const sc = stationClause(actor, "COALESCE(cs.station_id, st.station_id)");
      for (const a of all<{ id: string; filename: string; created_at: string; size_bytes: number; case_id: string | null; reference: string | null }>(
        `SELECT a.id, a.filename, a.created_at, a.size_bytes, a.case_id, cs.reference
           FROM attachments a LEFT JOIN cases cs ON cs.id = a.case_id LEFT JOIN statements st ON st.id = a.statement_id
          WHERE a.deleted_at IS NULL AND a.created_at < ? AND ${sc.sql} ORDER BY a.created_at LIMIT ?`,
        c,
        ...sc.params,
        limit,
      )) {
        items.push({ type: "attachment", id: a.id, label: a.filename, caseId: a.case_id, caseReference: a.reference, date: a.created_at, sizeBytes: a.size_bytes });
      }
    } else if (p.record_type === "closed_case") {
      const sc = stationClause(actor, "c.station_id");
      for (const k of all<{ id: string; reference: string; closed_at: string }>(
        `SELECT c.id, c.reference, c.closed_at FROM cases c
          WHERE c.closed_at IS NOT NULL AND c.closed_at < ? AND ${sc.sql} ORDER BY c.closed_at LIMIT ?`,
        c,
        ...sc.params,
        limit,
      )) {
        items.push({ type: "closed_case", id: k.id, label: `Closed case ${k.reference}`, caseId: k.id, caseReference: k.reference, date: k.closed_at, sizeBytes: null });
      }
    }
  }
  return items;
}

export function flaggedCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of listPolicies()) {
    if (p.action !== "flag_for_review") continue;
    const c = cutoff(p.retention_days);
    const q =
      p.record_type === "recording"
        ? "SELECT COUNT(*) AS n FROM recordings WHERE status = 'stored' AND created_at < ?"
        : p.record_type === "attachment"
          ? "SELECT COUNT(*) AS n FROM attachments WHERE deleted_at IS NULL AND created_at < ?"
          : p.record_type === "closed_case"
            ? "SELECT COUNT(*) AS n FROM cases WHERE closed_at IS NOT NULL AND closed_at < ?"
            : null;
    if (q) out[p.record_type] = get<{ n: number }>(q, c)!.n;
  }
  return out;
}

async function deleteRecording(id: string, actorId: string | null, reason: string, ip: string | null) {
  const r = get<{ id: string; storage_key: string | null; statement_id: string; case_id: string | null }>(
    "SELECT r.id, r.storage_key, r.statement_id, s.case_id FROM recordings r JOIN statements s ON s.id = r.statement_id WHERE r.id = ? AND r.status = 'stored'",
    id,
  );
  if (!r) throw new NotFoundError("Recording not found or already deleted.");
  if (r.storage_key) await storage().delete(r.storage_key);
  tx(() => {
    run(
      "UPDATE recordings SET status = 'deleted', storage_key = NULL, deleted_at = ?, deleted_by = ?, deletion_reason = ? WHERE id = ?",
      now(),
      actorId,
      reason,
      id,
    );
    audit({ actorId, action: "retention.recording_deleted", entityType: "recording", entityId: id, caseId: r.case_id, summary: `Recording deleted under retention policy — reason: ${reason}`, ip });
  });
}

async function deleteAttachment(id: string, actorId: string | null, reason: string, ip: string | null) {
  const a = get<{ id: string; storage_key: string | null; case_id: string | null }>(
    "SELECT id, storage_key, case_id FROM attachments WHERE id = ? AND deleted_at IS NULL",
    id,
  );
  if (!a) throw new NotFoundError("Attachment not found or already deleted.");
  if (a.storage_key) await storage().delete(a.storage_key);
  tx(() => {
    run(
      "UPDATE attachments SET storage_key = NULL, deleted_at = ?, deleted_by = ?, deletion_reason = ? WHERE id = ?",
      now(),
      actorId,
      reason,
      id,
    );
    audit({ actorId, action: "retention.attachment_deleted", entityType: "attachment", entityId: id, caseId: a.case_id, summary: `Attachment deleted under retention policy — reason: ${reason}`, ip });
  });
}

/** Delete one flagged item. Requires data.delete + settings.retention and that the item is actually past retention. */
export async function deleteFlaggedItem(actor: AuthUser, type: string, id: string, reason: string, ip: string | null) {
  if (!can(actor, "data.delete") || !can(actor, "settings.retention")) throw new ForbiddenError();
  if (type !== "recording" && type !== "attachment") {
    throw new ValidationError("Only recordings and attachments can be deleted here. Case records follow the approved records-destruction procedure.");
  }
  if (reason.trim().length < 5) throw new ValidationError("Give a reason for the deletion (at least 5 characters).", { reason: "Reason is required." });
  const flagged = findFlagged(actor, 10000).some((f) => f.type === type && f.id === id);
  if (!flagged) {
    audit({ actorId: actor.id, action: "retention.delete_refused", entityType: type, entityId: id, summary: "Deletion attempt refused: item not past retention or not in scope", ip });
    throw new ForbiddenError("This item is not past its retention period or is outside your scope.");
  }
  if (type === "recording") await deleteRecording(id, actor.id, reason.trim(), ip);
  else await deleteAttachment(id, actor.id, reason.trim(), ip);
}

/**
 * Apply all policies with action "delete". Safe to run repeatedly.
 * Returns counts per record type.
 */
export async function runAutomaticRetention(actorId: string | null, ip: string | null = null): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const p of listPolicies()) {
    if (p.action !== "delete" || !RETENTION_TYPES[p.record_type]?.allowDelete) continue;
    const c = cutoff(p.retention_days);
    let n = 0;
    if (p.record_type === "notification") {
      n = Number(run("DELETE FROM notifications WHERE created_at < ?", c).changes);
    } else if (p.record_type === "session") {
      n = Number(run("DELETE FROM sessions WHERE (revoked_at IS NOT NULL OR expires_at < ?) AND created_at < ?", now(), c).changes);
    } else if (p.record_type === "recording") {
      for (const r of all<{ id: string }>("SELECT id FROM recordings WHERE status = 'stored' AND created_at < ?", c)) {
        await deleteRecording(r.id, actorId, `Automatic deletion: retention period of ${p.retention_days} days elapsed`, ip);
        n++;
      }
    } else if (p.record_type === "attachment") {
      for (const a of all<{ id: string }>("SELECT id FROM attachments WHERE deleted_at IS NULL AND created_at < ?", c)) {
        await deleteAttachment(a.id, actorId, `Automatic deletion: retention period of ${p.retention_days} days elapsed`, ip);
        n++;
      }
    }
    result[p.record_type] = n;
    if (n > 0) {
      audit({ actorId, action: "retention.auto_purge", entityType: p.record_type, summary: `Automatic retention purge removed ${n} ${p.record_type} record(s) older than ${p.retention_days} days`, ip });
    }
  }
  return result;
}
