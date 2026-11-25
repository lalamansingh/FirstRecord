/** Pending (unanswered) active SOS alerts for the signed-in user. Polled by the in-app listener. */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { pendingAlertsFor } from "@/lib/domain/sos";
import { errorResponse } from "@/lib/http";
import { UnauthenticatedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    return NextResponse.json({ alerts: pendingAlertsFor(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
