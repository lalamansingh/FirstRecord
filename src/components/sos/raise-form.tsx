"use client";
import { useState } from "react";
import { Crosshair, Loader2, Siren } from "lucide-react";
import { ActionForm, SubmitButton, FieldError } from "@/components/forms";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { raiseSosAction } from "@/app/(app)/sos/actions";

export function RaiseSosForm() {
  const tr = useT();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  function fillMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoMsg(tr("This browser cannot share location."));
      return;
    }
    setLocating(true);
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGeoMsg(tr("Location added (accuracy about {m} m).", { m: Math.round(pos.coords.accuracy) }));
        setLocating(false);
      },
      (err) => {
        setGeoMsg(
          err.code === err.PERMISSION_DENIED
            ? tr("Location permission was denied. Allow location for this site in your browser settings.")
            : tr("Could not get your location right now."),
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }

  return (
    <ActionForm
      action={raiseSosAction}
      danger
      confirmTitle={tr("Send SOS alert?")}
      confirmLabel={tr("Send SOS now")}
      confirm={tr("Nearby staff will immediately get a siren alert on their devices. Use this only for real emergencies.")}
      className="space-y-4"
    >
      <Field label={tr("Title")} htmlFor="sos-title-in" required>
        <input id="sos-title-in" name="title" required maxLength={120} className={inputClass} placeholder={tr("e.g. Officer needs backup")} />
        <FieldError name="title" />
      </Field>
      <Field label={tr("Message")} htmlFor="sos-message-in" required>
        <textarea id="sos-message-in" name="message" required maxLength={1000} rows={3} className={inputClass} placeholder={tr("What is happening and what help is needed")} />
        <FieldError name="message" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={tr("Severity")} htmlFor="sos-sev">
          <select id="sos-sev" name="severity" defaultValue="critical" className={inputClass}>
            <option value="critical">{tr("Critical")}</option>
            <option value="high">{tr("High")}</option>
          </select>
        </Field>
        <Field label={tr("Radius (km)")} htmlFor="sos-radius" hint={tr("Only used when a location is given.")}>
          <input id="sos-radius" name="radiusKm" type="number" min={0.5} max={100} step={0.5} defaultValue={5} className={inputClass} />
          <FieldError name="radiusKm" />
        </Field>
      </div>
      <Field label={tr("Location")} htmlFor="sos-loc" hint={tr("Describe the place. Add GPS coordinates to alert only staff within the radius; without them, every active staff member of the station is alerted.")}>
        <input id="sos-loc" name="locationText" maxLength={300} className={inputClass} placeholder={tr("e.g. Main market, near bus stand")} />
      </Field>
      <div className="space-y-3">
        <div>
          <button type="button" onClick={fillMyLocation} disabled={locating} className={buttonClass("secondary")}>
            {locating ? <Loader2 className="animate-spin" aria-hidden /> : <Crosshair aria-hidden />} {tr("Use my current location")}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tr("Latitude")} htmlFor="sos-lat">
            <input id="sos-lat" name="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} />
          </Field>
          <Field label={tr("Longitude")} htmlFor="sos-lng">
            <input id="sos-lng" name="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </div>
      <FieldError name="lat" />
      <FieldError name="lng" />
      {geoMsg && <p role="status" className="text-sm text-slate-600">{geoMsg}</p>}
      <SubmitButton variant="danger">
        <Siren aria-hidden /> {tr("Send SOS")}
      </SubmitButton>
    </ActionForm>
  );
}
