/** Case attachments: validated upload, permission-checked download, audited soft delete. */
import path from "node:path";
import { all, get, insert, newId, now, update } from "@/lib/db";
import { assertCan, assertCaseAccess, assertCaseAction, can, type AuthUser } from "@/lib/rbac/access";
import { audit, recordAccess } from "@/lib/audit";
import { config } from "@/lib/config";
import { ALLOWED_ATTACHMENT_TYPES, createFileToken, safeFilename, sniffMatches, storage } from "@/lib/storage";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { formatBytes } from "@/lib/format";

export interface AttachmentRow {
  id: string;
  case_id: string | null;
  statement_id: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  description: string | null;
  scan_status: string;
  uploader: string;
  created_at: string;
  deleted_at: string | null;
  deletion_reason: string | null;
  deleter: string | null;
}

export function listCaseAttachments(user: AuthUser, caseId: string, includeDeleted = false) {
  assertCaseAccess(user, caseId);
  return all<AttachmentRow>(
    `SELECT a.id, a.case_id, a.statement_id, a.filename, a.mime_type, a.size_bytes, a.sha256, a.description, a.scan_status,
            u.name AS uploader, a.created_at, a.deleted_at, a.deletion_reason, d.name AS deleter
       FROM attachments a JOIN users u ON u.id = a.uploaded_by LEFT JOIN users d ON d.id = a.deleted_by
      WHERE a.case_id = ? ${includeDeleted ? "" : "AND a.deleted_at IS NULL"}
      ORDER BY a.created_at DESC`,
    caseId,
  );
}

export function validateUpload(filename: string, mime: string, data: Buffer) {
  if (data.length === 0) throw new ValidationError("The file is empty.", { file: "Choose a non-empty file" });
  if (data.length > config.maxUploadBytes) {
    throw new ValidationError(`File is too large. Maximum size is ${formatBytes(config.maxUploadBytes)}.`, { file: "File too large" });
  }
  const allowedExt = ALLOWED_ATTACHMENT_TYPES[mime];
  if (!allowedExt) {
    throw new ValidationError("This file type is not allowed. Allowed: PDF, JPEG, PNG, WebP, plain text, MP3, WAV, MP4.", { file: "File type not allowed" });
  }
  const ext = path.extname(filename).toLowerCase();
  if (!allowedExt.includes(ext)) throw new ValidationError(`The file extension does not match its type (${mime}).`, { file: "Extension mismatch" });
  if (!sniffMatches(mime, data)) throw new ValidationError("The file content does not match its declared type.", { file: "Content does not match type" });
}

export async function uploadAttachment(
  user: AuthUser,
  caseId: string,
  file: { name: string; type: string; data: Buffer },
  description: string | null,
  ip: string | null,
) {
  assertCaseAction(user, caseId, "attachment.upload");
  validateUpload(file.name, file.type, file.data);
  const stored = await storage().put(file.data, "attachments");
  const id = newId();
  const filename = safeFilename(file.name);
  try {
    insert("attachments", {
      id,
      case_id: caseId,
      filename,
      mime_type: file.type,
      size_bytes: stored.size,
      sha256: stored.sha256,
      storage_key: stored.key,
      description,
      scan_status: "not_scanned",
      uploaded_by: user.id,
      created_at: now(),
    });
  } catch (e) {
    await storage().delete(stored.key).catch(() => {});
    throw e;
  }
  update("cases", caseId, { updated_at: now() });
  audit({
    actorId: user.id,
    action: "attachment.uploaded",
    entityType: "attachment",
    entityId: id,
    caseId,
    summary: `Attachment uploaded (${file.type}, ${formatBytes(stored.size)})`,
    metadata: { filename, mime: file.type, size: stored.size, sha256: stored.sha256, scan: "not_scanned" },
    ip,
  });
  return { id, filename };
}

function loadForAccess(user: AuthUser, id: string) {
  const a = get<{ id: string; case_id: string | null; filename: string; mime_type: string; storage_key: string | null; deleted_at: string | null }>(
    "SELECT id, case_id, filename, mime_type, storage_key, deleted_at FROM attachments WHERE id = ?",
    id,
  );
  if (!a || !a.case_id) throw new NotFoundError();
  assertCaseAccess(user, a.case_id);
  return a;
}

/** Short-lived download URL (ids only; still requires the session at download time). */
export function attachmentDownloadUrl(user: AuthUser, id: string) {
  if (!can(user, "attachment.download")) return null;
  return `/api/attachments/${id}?token=${encodeURIComponent(createFileToken("attachment", id, user.id))}`;
}

export async function readAttachmentForDownload(user: AuthUser, id: string, ip: string | null) {
  assertCan(user, "attachment.download");
  const a = loadForAccess(user, id);
  if (a.deleted_at || !a.storage_key) throw new NotFoundError("This attachment has been deleted.");
  const data = await storage().get(a.storage_key);
  recordAccess({ userId: user.id, entityType: "attachment", entityId: id, caseId: a.case_id, action: "download", ip });
  audit({ actorId: user.id, action: "attachment.downloaded", entityType: "attachment", entityId: id, caseId: a.case_id, summary: "Attachment downloaded", ip });
  return { data, filename: a.filename, mime: a.mime_type };
}

export async function deleteAttachment(user: AuthUser, id: string, reason: string, ip: string | null) {
  assertCan(user, "attachment.delete");
  const a = loadForAccess(user, id);
  if (a.deleted_at) throw new ValidationError("This attachment is already deleted.");
  update("attachments", id, { deleted_at: now(), deleted_by: user.id, deletion_reason: reason, storage_key: null });
  if (a.storage_key) {
    try {
      await storage().delete(a.storage_key);
    } catch (e) {
      console.error("[attachments] storage delete failed:", (e as Error).message);
    }
  }
  audit({
    actorId: user.id,
    action: "attachment.deleted",
    entityType: "attachment",
    entityId: id,
    caseId: a.case_id,
    summary: "Attachment deleted (file removed from storage; metadata retained)",
    metadata: { reason },
    ip,
  });
  return { caseId: a.case_id! };
}
