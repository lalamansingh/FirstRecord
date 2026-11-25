/** Liveness/readiness probe for the hosting platform. Reveals no configuration or data. */
import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const ok = get<{ ok: number }>("SELECT 1 AS ok")?.ok === 1;
    return NextResponse.json({ status: ok ? "ok" : "error", db: ok ? "ok" : "error" }, { status: ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: "error", db: "error" }, { status: 503 });
  }
}
