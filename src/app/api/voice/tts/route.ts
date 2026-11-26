/** Voice assistant: text-to-speech proxy (Gnani). Signed-in users only; key stays server-side. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin, errorResponse, rateLimit } from "@/lib/http";
import { AppError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { synthesize, toTtsLanguage, voiceConfigured, VoiceUnavailableError, VoiceUpstreamError } from "@/lib/voice/gnani";

const schema = z.object({ text: z.string().trim().min(1).max(600), language: z.string().max(10).optional() });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    if (!voiceConfigured()) {
      return NextResponse.json({ error: "Voice assistant is not configured on this server." }, { status: 503 });
    }
    if (!rateLimit(`voice-tts:${user.id}`, 60, 60_000)) throw new AppError("Too many voice requests. Please wait a moment.", 429);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Text is missing or too long.");
    const audio = await synthesize(parsed.data.text, { language: toTtsLanguage(parsed.data.language) });
    return new NextResponse(audio, {
      status: 200,
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store", "Content-Length": String(audio.byteLength) },
    });
  } catch (e) {
    if (e instanceof VoiceUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof VoiceUpstreamError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
