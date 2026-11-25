/**
 * GET /api/attachments/:id?token=… — download. Requires the signed-in session,
 * a valid short-lived token bound to this user, attachment.download and case access.
 */
import { getCurrentUser, requestIp } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { readAttachmentForDownload } from "@/lib/domain/attachments";
import { verifyFileToken } from "@/lib/storage";
import { AppError, UnauthenticatedError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const token = new URL(req.url).searchParams.get("token");
    if (!verifyFileToken("attachment", id, user.id, token)) {
      throw new AppError("This download link has expired. Reload the case page and try again.", 403);
    }
    const file = await readAttachmentForDownload(user, id, await requestIp());
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(file.data.length),
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
