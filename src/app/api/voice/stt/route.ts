/** Voice assistant: speech-to-text proxy (Gnani). Signed-in users only; key stays server-side. */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin, errorResponse, rateLimit } from "@/lib/http";
import { AppError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { transcribeWithLang, voiceConfigured, VoiceUnavailableError, VoiceUpstreamError } from "@/lib/voice/gnani";

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    if (!voiceConfigured()) {
      return NextResponse.json({ error: "Voice assistant is not configured on this server." }, { status: 503 });
    }
    if (!rateLimit(`voice-stt:${user.id}`, 60, 60_000)) throw new AppError("Too many voice requests. Please wait a moment.", 429);
    const len = Number(req.headers.get("content-length") || 0);
    if (len > MAX_BYTES) throw new ValidationError("Audio is too long.");
    const form = await req.formData().catch(() => null);
    const file = form?.get("audio");
    if (!(file instanceof Blob) || file.size === 0) throw new ValidationError("No audio received.");
    if (file.size > MAX_BYTES) throw new ValidationError("Audio is too long.");
    const { text, language } = await transcribeWithLang(file);
    return NextResponse.json({ transcript: text, language }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof VoiceUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof VoiceUpstreamError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
