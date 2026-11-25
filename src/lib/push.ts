/**
 * Optional Web Push delivery for SOS alerts. Active only when VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY are set. Generate a key pair with `npx web-push generate-vapid-keys`.
 * A push shows a normal phone notification; the siren itself plays only while the
 * app is open in a browser tab.
 */
import "server-only";
import webpush from "web-push";
import { run } from "@/lib/db";
import { pushSubscriptionsFor } from "@/lib/domain/sos";

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

let initialised = false;
function init() {
  if (initialised) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@firstrecord.example",
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  initialised = true;
}

/** Send a push to every subscription of the given users. Never throws. */
export async function sendPush(userIds: string[], payload: { title: string; body: string; url: string; tag?: string }) {
  if (!pushConfigured() || !userIds.length) return { sent: 0, failed: 0 };
  init();
  let sent = 0;
  let failed = 0;
  const subs = pushSubscriptionsFor(userIds);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 600, urgency: "high" },
        );
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        // Subscription expired or revoked: forget it.
        if (code === 404 || code === 410) run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
        else console.error("[push] delivery failed:", code ?? (e as Error).message);
      }
    }),
  );
  return { sent, failed };
}
