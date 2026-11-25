/**
 * Upload a recording for a statement. Requires an active (granted, not later
 * withdrawn) consent event for the scope. Returns 201 only after the encrypted
 * object has been written and verified and the metadata row committed.
 */
import { NextResponse } from "next/server";
import { requireActor, requestIp } from "@/lib/auth/session";
import { assertSameOrigin, errorResponse, rateLimit } from "@/lib/http";
import { assertStatementAccess } from "@/lib/rbac/access";
import { AppError, ConflictError, ValidationError } from "@/lib/errors";
import { config } from "@/lib/config";
import { ALLOWED_RECORDING_TYPES, sniffMatches, storage } from "@/lib/storage";
import { insert, newId, now } from "@/lib/db";
import { audit } from "@/lib/audit";
import { currentConsent, getStatementRow } from "@/lib/domain/statements";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let storedKey: string | null = null;
  try {
    assertSameOrigin(req);
    const user = await requireActor("recording.create");
    if (!rateLimit(`rec:${user.id}`, 30, 60 * 60 * 1000)) throw new AppError("Too many uploads. Please wait and try again.", 429);
    const { id } = await ctx.params;
    assertStatementAccess(user, id);
    const s = getStatementRow(id)!;
    if (s.status === "abandoned") throw new ConflictError("This report was abandoned.");

    const len = Number(req.headers.get("content-length") || 0);
    if (len > config.maxRecordingBytes + 1024 * 1024) throw new ValidationError(`Recording is larger than the ${Math.round(config.maxRecordingBytes / 1048576)} MB limit.`);

    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "");
    const durationMs = Math.max(0, Math.min(Number(form.get("durationMs") || 0), 6 * 3600 * 1000)) || null;
    if (!(file instanceof File)) throw new ValidationError("No recording file was received.");
    if (kind !== "audio" && kind !== "video") throw new ValidationError("Invalid recording type.");

    const consent = currentConsent(id, kind);
    if (!consent || consent.decision !== "granted") {
      throw new ConflictError("No active recording consent for this statement. Recording cannot be saved without consent.");
    }

    const mime = file.type.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_RECORDING_TYPES.includes(mime)) throw new ValidationError(`Unsupported recording format (${mime || "unknown"}).`);
    if (!mime.startsWith(kind)) throw new ValidationError("Recording format does not match the recording type.");
    if (file.size === 0) throw new ValidationError("The recording is empty.");
    if (file.size > config.maxRecordingBytes) throw new ValidationError(`Recording is larger than the ${Math.round(config.maxRecordingBytes / 1048576)} MB limit.`);
    const data = Buffer.from(await file.arrayBuffer());
    if (!sniffMatches(mime, data)) throw new ValidationError("The file content does not match its declared format.");

    const obj = await storage().put(data, "recordings");
    storedKey = obj.key;
    const recId = newId();
    insert("recordings", {
      id: recId,
      statement_id: id,
      consent_event_id: consent.id,
      kind,
      mime_type: mime,
      size_bytes: obj.size,
      duration_ms: durationMs,
      storage_key: obj.key,
      sha256: obj.sha256,
      status: "stored",
      created_by: user.id,
      created_at: now(),
    });
    storedKey = null; // committed
    audit({
      actorId: user.id,
      action: "recording.saved",
      entityType: "recording",
      entityId: recId,
      caseId: s.case_id,
      summary: `${kind === "audio" ? "Audio" : "Video"} recording saved (${Math.round(obj.size / 1024)} KB) under consent ${consent.id.slice(0, 8)}`,
      metadata: { statementId: id, sha256: obj.sha256, sizeBytes: obj.size, durationMs, consentEventId: consent.id },
      ip: await requestIp(),
    });
    return NextResponse.json({ id: recId, sha256: obj.sha256, sizeBytes: obj.size }, { status: 201 });
  } catch (e) {
    if (storedKey) await storage().delete(storedKey).catch(() => {});
    return errorResponse(e);
  }
}
