"use client";
/**
 * Global SOS listener, mounted once in the signed-in layout. Polls for alerts this
 * user has received but not answered; shows a full-screen alert with a siren,
 * vibration and a flashing tab title until the user responds.
 * The siren can only play while this app is open in a browser tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Siren, MapPin, Volume2, VolumeX, X, Loader2 } from "lucide-react";
import { useT, useLang } from "@/lib/i18n/client";
import { formatRelative } from "@/lib/format";
import { beep, isUnlocked, startSiren, stopSiren, unlock } from "./siren";

interface PendingAlert {
  id: string;
  title: string;
  message: string;
  severity: "critical" | "high";
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  raisedBy: string;
  createdAt: string;
}

const POLL_MS = 5000;
const SOUND_PROMPT_KEY = "fr_sos_sound_prompt_dismissed";

export function SosListener() {
  const tr = useT();
  const lang = useLang();
  const router = useRouter();
  const [alerts, setAlerts] = useState<PendingAlert[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [showSoundPrompt, setShowSoundPrompt] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);
  const current = alerts[0] ?? null;

  // Unlock audio silently on the first interaction anywhere on the page.
  useEffect(() => {
    const onGesture = () => {
      unlock().then((ok) => {
        if (ok) {
          setUnlocked(true);
          setShowSoundPrompt(false);
        }
      });
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    const t = setTimeout(() => {
      if (!isUnlocked() && localStorage.getItem(SOUND_PROMPT_KEY) !== "1") setShowSoundPrompt(true);
    }, 1500);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  // Poll for pending alerts.
  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch("/api/sos/active", { cache: "no-store" });
        if (res.status === 401) {
          stopped.current = true;
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as { alerts: PendingAlert[] };
          setAlerts(data.alerts);
        }
      } catch {
        /* offline: try again next tick */
      }
      if (!stopped.current) timer = setTimeout(poll, document.hidden ? POLL_MS * 2 : POLL_MS);
    };
    poll();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, []);

  // Siren, vibration and title flash while an alert is pending.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!currentId) {
      stopSiren();
      return;
    }
    let cancelled = false;
    startSiren().then((ok) => {
      if (!cancelled) setSoundBlocked(!ok);
    });
    const vib = () => {
      try {
        navigator.vibrate?.([700, 250, 700, 250, 700]);
      } catch {
        /* unsupported */
      }
    };
    vib();
    const vibTimer = setInterval(vib, 3000);
    const original = document.title;
    let on = false;
    const titleTimer = setInterval(() => {
      on = !on;
      document.title = on ? "🚨 SOS 🚨" : original;
    }, 900);
    return () => {
      cancelled = true;
      stopSiren();
      clearInterval(vibTimer);
      clearInterval(titleTimer);
      document.title = original;
      try {
        navigator.vibrate?.(0);
      } catch {
        /* unsupported */
      }
    };
  }, [currentId]);

  const enableSound = useCallback(async () => {
    const ok = await unlock();
    setUnlocked(ok);
    setSoundBlocked(!ok);
    if (ok) {
      if (currentId) await startSiren();
      else beep();
      setShowSoundPrompt(false);
    }
  }, [currentId]);

  const answer = useCallback(
    async (response: "acknowledged" | "en_route" | "unavailable") => {
      if (!current) return;
      setBusy(response);
      setError(null);
      try {
        const res = await fetch("/api/sos/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId: current.id, response }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? tr("Could not send your response. Try again."));
        } else {
          stopSiren();
          setAlerts((a) => a.filter((x) => x.id !== current.id));
          router.refresh();
        }
      } catch {
        setError(tr("Could not send your response. Try again."));
      } finally {
        setBusy(null);
      }
    },
    [current, router, tr],
  );

  return (
    <>
      {showSoundPrompt && !unlocked && !current && (
        <div className="fixed bottom-4 right-4 z-[90] flex max-w-sm items-start gap-3 rounded-lg border border-red-200 bg-white p-4 shadow-[0_4px_12px_rgb(16_24_40/0.08)]" role="region" aria-label={tr("SOS alert sound")}>
          <Siren className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-slate-900">{tr("Enable SOS alert sound")}</p>
            <p className="mt-0.5 text-slate-600">{tr("Browsers block sound until you interact with the page. Enable it so an SOS can sound a siren while this app is open.")}</p>
            <button type="button" onClick={enableSound} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#B42318] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#912018]">
              <Volume2 className="h-4 w-4" aria-hidden /> {tr("Enable alert sound")}
            </button>
          </div>
          <button
            type="button"
            aria-label={tr("Dismiss")}
            className="rounded p-1 text-slate-400 hover:text-slate-700"
            onClick={() => {
              localStorage.setItem(SOUND_PROMPT_KEY, "1");
              setShowSoundPrompt(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {current && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="sos-title" aria-describedby="sos-message" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#B42318] p-4 text-white">
          <div className="relative w-full max-w-lg rounded-lg border border-white/25 bg-[#912018] p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-white text-[#B42318]">
                <Siren className="h-7 w-7" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold text-red-100">
                  {current.severity === "critical" ? tr("Critical SOS") : tr("High priority SOS")}
                </p>
                <h2 id="sos-title" className="text-2xl font-bold leading-tight">{current.title}</h2>
              </div>
            </div>
            <p id="sos-message" className="mt-4 whitespace-pre-wrap text-base leading-7">{current.message}</p>
            <dl className="mt-4 space-y-1 text-sm text-red-50">
              {(current.locationText || current.lat != null) && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <dd>
                    {current.locationText ?? ""}
                    {current.distanceKm != null && <span> · {tr("{km} km from you", { km: current.distanceKm.toFixed(1) })}</span>}
                    {current.lat != null && current.lng != null && (
                      <>
                        {" · "}
                        <a className="underline" href={`https://www.google.com/maps?q=${current.lat},${current.lng}`} target="_blank" rel="noopener noreferrer">
                          {tr("Open map")}
                        </a>
                      </>
                    )}
                  </dd>
                </div>
              )}
              <div>
                {tr("Raised by {name}", { name: current.raisedBy })} · {formatRelative(current.createdAt, lang)}
              </div>
              {alerts.length > 1 && <div className="font-semibold">{tr("{n} more active alerts", { n: alerts.length - 1 })}</div>}
            </dl>

            {soundBlocked && (
              <button type="button" onClick={enableSound} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-white/40 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20">
                <VolumeX className="h-4 w-4" aria-hidden /> {tr("Sound is blocked by the browser — tap to sound the siren")}
              </button>
            )}

            {error && <p role="alert" className="mt-3 rounded-md bg-white/15 px-3 py-2 text-sm">{error}</p>}

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" disabled={!!busy} onClick={() => answer("en_route")} className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-base font-semibold text-[#912018] hover:bg-red-50 disabled:opacity-60">
                {busy === "en_route" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {tr("On my way")}
              </button>
              <button type="button" disabled={!!busy} onClick={() => answer("acknowledged")} className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/60 px-4 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-60">
                {busy === "acknowledged" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {tr("Acknowledge")}
              </button>
              <button type="button" disabled={!!busy} onClick={() => answer("unavailable")} className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/30 px-4 py-3 text-sm font-medium text-red-100 hover:bg-white/10 disabled:opacity-60">
                {busy === "unavailable" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {tr("Unavailable")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
