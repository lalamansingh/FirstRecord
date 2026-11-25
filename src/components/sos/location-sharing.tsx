"use client";
/**
 * Voluntary on-duty location sharing for SOS targeting. While enabled and this
 * app is open, the position is sent at most once a minute (or after moving
 * ~100 m). Turning it off stops tracking and erases the stored position.
 */
import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { useT, useLang } from "@/lib/i18n/client";
import { formatRelative } from "@/lib/format";
import { haversineKmClient } from "./geo";

const MIN_INTERVAL_MS = 60_000;
const MIN_MOVE_KM = 0.1;

export function LocationSharing({ initialEnabled, lastUpdated }: { initialEnabled: boolean; lastUpdated: string | null }) {
  const tr = useT();
  const lang = useLang();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(lastUpdated);
  const last = useRef<{ t: number; lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const prev = last.current;
        const t = Date.now();
        if (prev && t - prev.t < MIN_INTERVAL_MS && haversineKmClient(prev.lat, prev.lng, lat, lng) < MIN_MOVE_KM) return;
        last.current = { t, lat, lng };
        try {
          const res = await fetch("/api/sos/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng, accuracy: Math.round(accuracy) }),
          });
          if (res.ok) {
            setUpdatedAt(new Date().toISOString());
            setStatus(null);
          }
        } catch {
          /* offline; next position update will retry */
        }
      },
      (err) => {
        setStatus(
          err.code === err.PERMISSION_DENIED
            ? tr("Location permission was denied. Allow location for this site in your browser settings.")
            : tr("Could not get your location right now."),
        );
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, tr]);

  async function toggle(next: boolean) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/sos/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setEnabled(next);
        last.current = null;
        if (!next) setUpdatedAt(null);
      } else setStatus(tr("Could not change location sharing. Try again."));
    } catch {
      setStatus(tr("Could not change location sharing. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium text-slate-900">
            <MapPin className="h-4 w-4 text-slate-500" aria-hidden />
            {tr("Share my on-duty location (used only for SOS alerts)")}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />}
          </span>
          <span className="mt-0.5 block text-sm text-slate-600">
            {tr("Your position is sent only while FirstRecord is open, and is used only to decide whether you are near an SOS. Turning this off erases your stored position.")}
          </span>
        </span>
      </label>
      {enabled && (
        <p className="text-sm text-emerald-700">
          {updatedAt ? tr("Sharing on · last updated {when}", { when: formatRelative(updatedAt, lang) }) : tr("Sharing on · waiting for your location…")}
        </p>
      )}
      {enabled && typeof navigator !== "undefined" && !("geolocation" in navigator) && (
        <p role="status" className="text-sm text-amber-700">{tr("This browser cannot share location.")}</p>
      )}
      {status && <p role="status" className="text-sm text-amber-700">{status}</p>}
    </div>
  );
}
