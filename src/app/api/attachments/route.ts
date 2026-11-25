/**
 * POST /api/attachments — multipart upload: fields caseId, description, file.
 * Same-origin + session required; permission and case access enforced in the service.
 */
import { NextResponse } from "next/server";
import { getCurrentUser, requestIp } from "@/lib/auth/session";
import { assertSameOrigin, errorResponse, rateLimit } from "@/lib/http";
import { uploadAttachment } from "@/lib/domain/attachments";
import { AppError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    if (!rateLimit(`upload:${user.id}`, 30, 10 * 60 * 1000)) throw new AppError("Too many uploads. Please wait and try again.", 429);
    const len = Number(req.headers.get("content-length") || 0);
    if (len > config.maxUploadBytes + 1024 * 1024) throw new ValidationError("File is too large.", { file: "File too large" });
    const fd = await req.formData();
    const caseId = String(fd.get("caseId") || "");
    const description = String(fd.get("description") || "").trim().slice(0, 500) || null;
    const file = fd.get("file");
    if (!/^[0-9a-f-]{36}$/.test(caseId)) throw new ValidationError("Invalid case.");
    if (!(file instanceof File)) throw new ValidationError("Choose a file to upload.", { file: "Choose a file" });
    const data = Buffer.from(await file.arrayBuffer());
    const result = await uploadAttachment(user, caseId, { name: file.name, type: file.type, data }, description, await requestIp());
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
