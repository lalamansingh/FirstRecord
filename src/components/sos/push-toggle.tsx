"use client";
/** Opt in to phone notifications for SOS alerts (Web Push). Rendered only when the server has VAPID keys. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/components/ui";

const noopSubscribe = () => () => {};

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const tr = useT();
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    () => null,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => undefined);
  }, [supported]);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg(tr("Notifications are blocked for this site. Allow them in your browser settings."));
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const res = await fetch("/api/sos/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error();
      setSubscribed(true);
      setMsg(tr("Phone notifications are on for this device."));
    } catch {
      setMsg(tr("Could not turn on phone notifications on this device."));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/sos/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  if (supported === false) return <p className="text-sm text-slate-600">{tr("This browser does not support phone notifications.")}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || supported === null}
          onClick={subscribed ? disable : enable}
          className={buttonClass(subscribed ? "secondary" : "primary")}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
          {subscribed ? tr("Turn off phone notifications") : tr("Enable phone notifications")}
        </button>
        {subscribed && <span className="text-sm text-emerald-700">{tr("On for this device")}</span>}
      </div>
      <p className="text-sm text-slate-600">
        {tr("When the app is closed, an SOS arrives as a normal phone notification with your usual notification sound. The siren plays only while FirstRecord is open.")}
      </p>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
    </div>
  );
}
