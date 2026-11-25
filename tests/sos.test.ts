import { describe, it, expect } from "vitest";
import { haversineKm, selectRecipients, LOCATION_MAX_AGE_MS, raiseAlert, respond, closeAlert, pendingAlertsFor, listResponders, setLocationSharing, updateLocation, getLocationSharing, type Candidate } from "@/lib/domain/sos";
import { all, get } from "@/lib/db";
import { loadAuthUser } from "@/lib/auth/users";
import { seeded } from "./helpers";
import type { AuthUser } from "@/lib/rbac/access";

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(28.6139, 77.209, 28.6139, 77.209)).toBe(0);
  });
  it("matches known distances", () => {
    // New Delhi → Mumbai ≈ 1150 km
    expect(haversineKm(28.6139, 77.209, 19.076, 72.8777)).toBeGreaterThan(1130);
    expect(haversineKm(28.6139, 77.209, 19.076, 72.8777)).toBeLessThan(1170);
    // 0.01° latitude ≈ 1.11 km
    expect(haversineKm(10, 76, 10.01, 76)).toBeCloseTo(1.112, 2);
  });
  it("is symmetric", () => {
    expect(haversineKm(1, 2, 3, 4)).toBeCloseTo(haversineKm(3, 4, 1, 2), 9);
  });
});

describe("selectRecipients", () => {
  const nowMs = Date.parse("2026-01-01T12:00:00Z");
  const fresh = new Date(nowMs - 60_000).toISOString();
  const stale = new Date(nowMs - LOCATION_MAX_AGE_MS - 60_000).toISOString();
  const base = { lat: 28.6, lng: 77.2 };
  const cands: Candidate[] = [
    { userId: "near", sharing: true, lat: 28.61, lng: 77.2, updatedAt: fresh }, // ~1.1 km
    { userId: "far", sharing: true, lat: 28.8, lng: 77.2, updatedAt: fresh }, // ~22 km
    { userId: "stale", sharing: true, lat: 28.6, lng: 77.2, updatedAt: stale },
    { userId: "notsharing", sharing: false, lat: 28.6, lng: 77.2, updatedAt: fresh },
    { userId: "nolocation", sharing: true, lat: null, lng: null, updatedAt: fresh },
  ];

  it("targets only fresh, sharing users inside the radius", () => {
    const r = selectRecipients({ ...base, radiusKm: 5 }, cands, nowMs);
    expect(r.map((x) => x.userId)).toEqual(["near"]);
    expect(r[0].distanceKm).toBeGreaterThan(1);
    expect(r[0].distanceKm).toBeLessThan(1.2);
  });

  it("widens with the radius and sorts by distance", () => {
    const r = selectRecipients({ ...base, radiusKm: 50 }, cands, nowMs);
    expect(r.map((x) => x.userId)).toEqual(["near", "far"]);
  });

  it("alerts every candidate with null distance when the alert has no location", () => {
    const r = selectRecipients({ lat: null, lng: null, radiusKm: 5 }, cands, nowMs);
    expect(r).toHaveLength(cands.length);
    expect(r.every((x) => x.distanceKm === null)).toBe(true);
  });
});

describe("SOS workflow", () => {
  function users() {
    const base = seeded();
    const list = Object.values(base.users).map((id) => loadAuthUser(id)!).filter(Boolean) as AuthUser[];
    const admin = list.find((u) => u.permissions.has("sos.raise") && u.permissions.has("sos.manage") && u.stationId)!;
    const others = list.filter((u) => u.id !== admin.id && u.stationId === admin.stationId);
    return { admin, others };
  }

  it("station-wide alert reaches active station staff, and responses are recorded", () => {
    const { admin, others } = users();
    expect(admin).toBeTruthy();
    expect(others.length).toBeGreaterThan(0);
    const { id, recipients } = raiseAlert(admin, { title: "Backup needed", message: "Test", severity: "critical", lat: null, lng: null, radiusKm: 5, locationText: "Test Road" });
    expect(recipients).not.toContain(admin.id);
    for (const o of others) expect(recipients).toContain(o.id);

    const responder = others[0];
    expect(pendingAlertsFor(responder.id).map((a) => a.id)).toContain(id);
    respond(responder, id, "en_route");
    expect(pendingAlertsFor(responder.id).map((a) => a.id)).not.toContain(id);
    expect(listResponders(id).find((r) => r.user_id === responder.id)?.response).toBe("en_route");

    const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'sos_alert' AND entity_id = ?", id)!.n;
    expect(n).toBe(recipients.length);
    expect(all("SELECT id FROM audit_events WHERE entity_id = ? AND action LIKE 'sos.%'", id).length).toBeGreaterThanOrEqual(2);

    closeAlert(admin, id, "resolved", "All clear");
    expect(pendingAlertsFor(others[1]?.id ?? responder.id).map((a) => a.id)).not.toContain(id);
    expect(() => respond(responder, id, "acknowledged")).toThrow();
  });

  it("located alert reaches only nearby sharing staff", () => {
    const { admin, others } = users();
    const [near, far] = others;
    setLocationSharing(near.id, true);
    updateLocation(near.id, 28.601, 77.2, 20);
    if (far) {
      setLocationSharing(far.id, true);
      updateLocation(far.id, 29.5, 77.2, 20);
    }
    const { recipients } = raiseAlert(admin, { title: "Located", message: "Test", severity: "high", lat: 28.6, lng: 77.2, radiusKm: 2, locationText: null });
    expect(recipients).toContain(near.id);
    if (far) expect(recipients).not.toContain(far.id);

    setLocationSharing(near.id, false);
    expect(getLocationSharing(near.id)).toMatchObject({ enabled: false, lat: null, lng: null });
    expect(() => updateLocation(near.id, 28.6, 77.2, null)).toThrow();
  });

  it("users without sos.raise cannot raise alerts", () => {
    const { others } = users();
    const plain = others.find((u) => !u.permissions.has("sos.raise"))!;
    expect(() => raiseAlert(plain, { title: "x", message: "x", severity: "high", lat: null, lng: null, radiusKm: 5, locationText: null })).toThrow();
  });
});
