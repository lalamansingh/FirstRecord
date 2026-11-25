/** A recipient answers an SOS alert: acknowledged / en route / unavailable. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, requestIp } from "@/lib/auth/session";
import { respond, SOS_RESPONSES } from "@/lib/domain/sos";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { UnauthenticatedError, ValidationError } from "@/lib/errors";

const schema = z.object({ alertId: z.string().min(1).max(64), response: z.enum(SOS_RESPONSES as [string, ...string[]]) });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid response.");
    respond(user, parsed.data.alertId, parsed.data.response as (typeof SOS_RESPONSES)[number], await requestIp());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
