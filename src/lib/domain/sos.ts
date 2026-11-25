/**
 * SOS alerts: an authorized officer raises an alert; active staff of the station
 * who share their on-duty location and are within the radius receive it (or every
 * active station user when the alert has no location). Recipients see a siren
 * overlay while the app is open and, if Web Push is configured, a phone notification.
 *
 * Location sharing is voluntary and used only to target SOS alerts.
 */
import { all, get, insert, newId, now, run, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, type AuthUser } from "@/lib/rbac/access";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export type SosSeverity = "critical" | "high";
export type SosStatus = "active" | "resolved" | "cancelled";
export type SosResponse = "acknowledged" | "en_route" | "unavailable";
export const SOS_RESPONSES: SosResponse[] = ["acknowledged", "en_route", "unavailable"];

/** A user's shared location is ignored for targeting once it is older than this. */
export const LOCATION_MAX_AGE_MS = 30 * 60 * 1000;

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Candidate {
  userId: string;
  sharing: boolean;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
}

/**
 * Pure targeting rule.
 *  - Alert without coordinates → every candidate, distance null.
 *  - Alert with coordinates → candidates sharing a fresh location within the radius.
 */
export function selectRecipients(
  alert: { lat: number | null; lng: number | null; radiusKm: number },
  candidates: Candidate[],
  nowMs = Date.now(),
): { userId: string; distanceKm: number | null }[] {
  if (alert.lat == null || alert.lng == null) return candidates.map((c) => ({ userId: c.userId, distanceKm: null }));
  const out: { userId: string; distanceKm: number | null }[] = [];
  for (const c of candidates) {
    if (!c.sharing || c.lat == null || c.lng == null || !c.updatedAt) continue;
    if (nowMs - Date.parse(c.updatedAt) > LOCATION_MAX_AGE_MS) continue;
    const d = haversineKm(alert.lat, alert.lng, c.lat, c.lng);
    if (d <= alert.radiusKm) out.push({ userId: c.userId, distanceKm: Math.round(d * 100) / 100 });
  }
  return out.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

function stationCandidates(stationId: string | null, excludeUserId: string): Candidate[] {
  const rows = all<{ id: string; sharing_enabled: number | null; lat: number | null; lng: number | null; updated_at: string | null }>(
    `SELECT u.id, l.sharing_enabled, l.lat, l.lng, l.updated_at
       FROM users u LEFT JOIN user_locations l ON l.user_id = u.id
      WHERE u.status = 'active' AND u.id <> ? AND (u.station_id IS ? OR u.station_id = ?)`,
    excludeUserId,
    stationId,
    stationId,
  );
  return rows.map((r) => ({ userId: r.id, sharing: !!r.sharing_enabled, lat: r.lat, lng: r.lng, updatedAt: r.updated_at }));
}

export interface RaiseInput {
  title: string;
  message: string;
  severity: SosSeverity;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  locationText: string | null;
}

export function raiseAlert(user: AuthUser, input: RaiseInput, ip?: string | null): { id: string; recipients: string[] } {
  assertCan(user, "sos.raise");
  if ((input.lat == null) !== (input.lng == null)) throw new ValidationError("Provide both latitude and longitude, or neither.");
  if (input.lat != null && (input.lat < -90 || input.lat > 90 || input.lng! < -180 || input.lng! > 180)) {
    throw new ValidationError("Location coordinates are out of range.");
  }
  const id = newId();
  const t = now();
  const recipients = selectRecipients({ lat: input.lat, lng: input.lng, radiusKm: input.radiusKm }, stationCandidates(user.stationId, user.id));
  tx(() => {
    insert("sos_alerts", {
      id,
      station_id: user.stationId,
      raised_by: user.id,
      title: input.title,
      message: input.message,
      severity: input.severity,
      lat: input.lat,
      lng: input.lng,
      radius_km: input.radiusKm,
      location_text: input.locationText,
      status: "active",
      created_at: t,
    });
    for (const r of recipients) {
      insert("sos_recipients", { alert_id: id, user_id: r.userId, distance_km: r.distanceKm, delivered_at: null });
      // SOS bypasses notification muting on purpose.
      insert("notifications", {
        id: newId(),
        user_id: r.userId,
        kind: "sos",
        title: `SOS: ${input.title}`.slice(0, 200),
        link: `/sos/${id}`,
        entity_type: "sos_alert",
        entity_id: id,
        read_at: null,
        created_at: t,
      });
    }
    audit({
      actorId: user.id,
      action: "sos.raised",
      entityType: "sos_alert",
      entityId: id,
      summary: `SOS raised (${input.severity}) to ${recipients.length} recipient(s)`,
      metadata: { severity: input.severity, radiusKm: input.radiusKm, located: input.lat != null, recipients: recipients.length },
      ip,
    });
  });
  return { id, recipients: recipients.map((r) => r.userId) };
}

export function closeAlert(user: AuthUser, alertId: string, outcome: "resolved" | "cancelled", note: string | null, ip?: string | null) {
  assertCan(user, "sos.manage");
  const a = getAlertRow(alertId);
  if (!a) throw new NotFoundError("Alert not found.");
  if (a.station_id && user.stationId && a.station_id !== user.stationId) throw new ForbiddenError();
  if (a.status !== "active") throw new ValidationError("This alert is already closed.");
  const t = now();
  run(
    "UPDATE sos_alerts SET status = ?, resolved_at = ?, resolved_by = ?, resolution_note = ? WHERE id = ?",
    outcome,
    t,
    user.id,
    note,
    alertId,
  );
  audit({ actorId: user.id, action: `sos.${outcome}`, entityType: "sos_alert", entityId: alertId, summary: `SOS ${outcome}`, ip });
}

export function respond(user: AuthUser, alertId: string, response: SosResponse, ip?: string | null) {
  const r = get<{ response: string | null }>("SELECT response FROM sos_recipients WHERE alert_id = ? AND user_id = ?", alertId, user.id);
  if (!r) throw new NotFoundError("You are not a recipient of this alert.");
  const a = getAlertRow(alertId);
  if (!a || a.status !== "active") throw new ValidationError("This alert is no longer active.");
  const t = now();
  run("UPDATE sos_recipients SET response = ?, responded_at = ?, delivered_at = COALESCE(delivered_at, ?) WHERE alert_id = ? AND user_id = ?", response, t, t, alertId, user.id);
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND entity_type = 'sos_alert' AND entity_id = ? AND read_at IS NULL", t, user.id, alertId);
  audit({ actorId: user.id, action: "sos.responded", entityType: "sos_alert", entityId: alertId, summary: `SOS response: ${response}`, ip });
}

interface AlertRow {
  id: string;
  station_id: string | null;
  raised_by: string;
  title: string;
  message: string;
  severity: SosSeverity;
  lat: number | null;
  lng: number | null;
  radius_km: number;
  location_text: string | null;
  status: SosStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

function getAlertRow(id: string) {
  return get<AlertRow>("SELECT * FROM sos_alerts WHERE id = ?", id);
}

export interface ActiveAlertForUser {
  id: string;
  title: string;
  message: string;
  severity: SosSeverity;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  raisedBy: string;
  createdAt: string;
}

/** Active alerts this user has received but not yet answered. Marks them delivered. */
export function pendingAlertsFor(userId: string): ActiveAlertForUser[] {
  const rows = all<AlertRow & { distance_km: number | null; raised_by_name: string }>(
    `SELECT a.*, r.distance_km, u.name AS raised_by_name
       FROM sos_recipients r JOIN sos_alerts a ON a.id = r.alert_id JOIN users u ON u.id = a.raised_by
      WHERE r.user_id = ? AND r.response IS NULL AND a.status = 'active'
      ORDER BY a.created_at DESC LIMIT 5`,
    userId,
  );
  if (rows.length) run("UPDATE sos_recipients SET delivered_at = ? WHERE user_id = ? AND delivered_at IS NULL", now(), userId);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    severity: r.severity,
    locationText: r.location_text,
    lat: r.lat,
    lng: r.lng,
    distanceKm: r.distance_km,
    raisedBy: r.raised_by_name,
    createdAt: r.created_at,
  }));
}

export interface AlertSummary extends AlertRow {
  raised_by_name: string;
  resolved_by_name: string | null;
  recipients: number;
  responded: number;
  my_response: SosResponse | null;
  am_recipient: number;
}

/** Alerts visible to the user: their station's alerts (or all, if they have no station). */
export function listAlerts(user: AuthUser, opts: { status?: "active" | "closed"; limit?: number } = {}): AlertSummary[] {
  const where: string[] = [];
  const params: (string | number | null)[] = [user.id, user.id];
  if (user.stationId) {
    where.push("(a.station_id = ? OR a.station_id IS NULL)");
    params.push(user.stationId);
  }
  if (opts.status === "active") where.push("a.status = 'active'");
  if (opts.status === "closed") where.push("a.status <> 'active'");
  params.push(opts.limit ?? 50);
  return all<AlertSummary>(
    `SELECT a.*, u.name AS raised_by_name, ru.name AS resolved_by_name,
            (SELECT COUNT(*) FROM sos_recipients r WHERE r.alert_id = a.id) AS recipients,
            (SELECT COUNT(*) FROM sos_recipients r WHERE r.alert_id = a.id AND r.response IS NOT NULL) AS responded,
            (SELECT response FROM sos_recipients r WHERE r.alert_id = a.id AND r.user_id = ?) AS my_response,
            (SELECT COUNT(*) FROM sos_recipients r WHERE r.alert_id = a.id AND r.user_id = ?) AS am_recipient
       FROM sos_alerts a JOIN users u ON u.id = a.raised_by LEFT JOIN users ru ON ru.id = a.resolved_by
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY a.created_at DESC LIMIT ?`,
    ...params,
  );
}

export function getAlert(user: AuthUser, id: string) {
  const a = get<AlertSummary>(
    `SELECT a.*, u.name AS raised_by_name, ru.name AS resolved_by_name,
            (SELECT COUNT(*) FROM sos_recipients r WHERE r.alert_id = a.id) AS recipients,
            (SELECT COUNT(*) FROM sos_recipients r WHERE r.alert_id = a.id AND r.response IS NOT NULL) AS responded,
            (SELECT response FROM sos_recipients r WHERE r.alert_id = a.id AND r.user_id = ?) AS my_response,
            (SELECT COUNT(*) FROM sos_recipients r WHERE r.alert_id = a.id AND r.user_id = ?) AS am_recipient
       FROM sos_alerts a JOIN users u ON u.id = a.raised_by LEFT JOIN users ru ON ru.id = a.resolved_by
      WHERE a.id = ?`,
    user.id,
    user.id,
    id,
  );
  if (!a) throw new NotFoundError("Alert not found.");
  if (a.station_id && user.stationId && a.station_id !== user.stationId) throw new ForbiddenError();
  return a;
}

export function listResponders(alertId: string) {
  return all<{
    user_id: string;
    name: string;
    badge_number: string | null;
    distance_km: number | null;
    delivered_at: string | null;
    response: SosResponse | null;
    responded_at: string | null;
  }>(
    `SELECT r.user_id, u.name, u.badge_number, r.distance_km, r.delivered_at, r.response, r.responded_at
       FROM sos_recipients r JOIN users u ON u.id = r.user_id
      WHERE r.alert_id = ?
      ORDER BY CASE r.response WHEN 'en_route' THEN 0 WHEN 'acknowledged' THEN 1 WHEN 'unavailable' THEN 3 ELSE 2 END,
               r.distance_km IS NULL, r.distance_km, u.name`,
    alertId,
  );
}

/* ---------------- Location sharing ---------------- */

export function getLocationSharing(userId: string) {
  const r = get<{ sharing_enabled: number; lat: number | null; lng: number | null; accuracy_m: number | null; updated_at: string }>(
    "SELECT sharing_enabled, lat, lng, accuracy_m, updated_at FROM user_locations WHERE user_id = ?",
    userId,
  );
  return { enabled: !!r?.sharing_enabled, lat: r?.lat ?? null, lng: r?.lng ?? null, accuracyM: r?.accuracy_m ?? null, updatedAt: r?.updated_at ?? null };
}

export function setLocationSharing(userId: string, enabled: boolean) {
  const t = now();
  if (enabled) {
    run(
      `INSERT INTO user_locations (user_id, sharing_enabled, updated_at) VALUES (?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET sharing_enabled = 1, updated_at = excluded.updated_at`,
      userId,
      t,
    );
  } else {
    // Turning sharing off also forgets the last position.
    run(
      `INSERT INTO user_locations (user_id, sharing_enabled, updated_at) VALUES (?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET sharing_enabled = 0, lat = NULL, lng = NULL, accuracy_m = NULL, updated_at = excluded.updated_at`,
      userId,
      t,
    );
  }
  audit({ actorId: userId, action: enabled ? "sos.location_on" : "sos.location_off", entityType: "user", entityId: userId, summary: `SOS location sharing ${enabled ? "enabled" : "disabled"}` });
}

export function updateLocation(userId: string, lat: number, lng: number, accuracyM: number | null) {
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) throw new ValidationError("Invalid coordinates.");
  const r = get<{ sharing_enabled: number }>("SELECT sharing_enabled FROM user_locations WHERE user_id = ?", userId);
  if (!r?.sharing_enabled) throw new ValidationError("Location sharing is off.");
  run("UPDATE user_locations SET lat = ?, lng = ?, accuracy_m = ?, updated_at = ? WHERE user_id = ?", lat, lng, accuracyM, now(), userId);
}

/* ---------------- Push subscriptions ---------------- */

export function savePushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
  run(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    newId(),
    userId,
    sub.endpoint,
    sub.p256dh,
    sub.auth,
    now(),
  );
}

export function deletePushSubscription(userId: string, endpoint: string) {
  run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", userId, endpoint);
}

export function pushSubscriptionsFor(userIds: string[]) {
  if (!userIds.length) return [];
  return all<{ user_id: string; endpoint: string; p256dh: string; auth: string }>(
    `SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    ...userIds,
  );
}

export function hasPushSubscription(userId: string) {
  return !!get("SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1", userId);
}
