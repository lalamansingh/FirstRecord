/** Stream a recording for playback. Session + expiring user-bound token + permission + statement access. */
import { getCurrentUser, requestIp } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { assertStatementAccess, can } from "@/lib/rbac/access";
import { AppError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { get } from "@/lib/db";
import { storage, verifyFileToken } from "@/lib/storage";
import { audit, recordAccess } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    if (!can(user, "recording.view")) throw new ForbiddenError();
    const { id } = await ctx.params;
    const token = new URL(req.url).searchParams.get("token");
    if (!verifyFileToken("recording", id, user.id, token)) throw new AppError("This playback link has expired. Reload the page to get a new one.", 403);
    const rec = get<{ statement_id: string; mime_type: string; storage_key: string | null; status: string }>(
      "SELECT statement_id, mime_type, storage_key, status FROM recordings WHERE id = ?",
      id,
    );
    if (!rec) throw new NotFoundError();
    assertStatementAccess(user, rec.statement_id);
    if (rec.status !== "stored" || !rec.storage_key) throw new NotFoundError("This recording has been deleted under the retention policy.");
    const data = await storage().get(rec.storage_key);
    const caseId = get<{ case_id: string | null }>("SELECT case_id FROM statements WHERE id = ?", rec.statement_id)?.case_id ?? null;
    const ip = await requestIp();
    recordAccess({ userId: user.id, entityType: "recording", entityId: id, caseId, action: "play", ip });
    audit({ actorId: user.id, action: "recording.accessed", entityType: "recording", entityId: id, caseId, summary: "Recording opened for playback", ip });
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": rec.mime_type,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="recording-${id.slice(0, 8)}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
