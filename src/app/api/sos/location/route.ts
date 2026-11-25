/**
 * Voluntary on-duty location sharing, used only to target SOS alerts.
 *  POST { enabled: boolean }            → turn sharing on/off (off forgets the position)
 *  POST { lat, lng, accuracy? }         → update position (only while sharing is on)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { setLocationSharing, updateLocation } from "@/lib/domain/sos";
import { assertSameOrigin, errorResponse, rateLimit } from "@/lib/http";
import { AppError, UnauthenticatedError, ValidationError } from "@/lib/errors";

const schema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000).nullish() }),
]);

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    if (!rateLimit(`sosloc:${user.id}`, 120, 60 * 60 * 1000)) throw new AppError("Too many location updates.", 429);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid location data.");
    const d = parsed.data;
    if ("enabled" in d) setLocationSharing(user.id, d.enabled);
    else updateLocation(user.id, d.lat, d.lng, d.accuracy ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
