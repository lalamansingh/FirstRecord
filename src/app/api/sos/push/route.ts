/** Store or remove this browser's Web Push subscription (only when VAPID keys are configured). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { savePushSubscription, deletePushSubscription } from "@/lib/domain/sos";
import { pushConfigured } from "@/lib/push";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { AppError, UnauthenticatedError, ValidationError } from "@/lib/errors";

const subSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoint must be HTTPS"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

async function auth(req: Request) {
  assertSameOrigin(req);
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (!pushConfigured()) throw new AppError("Phone notifications are not configured on this server.", 404);
  return user;
}

export async function POST(req: Request) {
  try {
    const user = await auth(req);
    const parsed = subSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid subscription.");
    savePushSubscription(user.id, { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await auth(req);
    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string") throw new ValidationError("Missing endpoint.");
    deletePushSubscription(user.id, body.endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
