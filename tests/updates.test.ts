import { describe, it, expect, beforeAll } from "vitest";
import { all, get } from "@/lib/db";
import {
  createBulletin, updateBulletin, archiveBulletin, acknowledgeBulletin, markBulletinRead, getBulletin,
  listBulletins, unreadBulletinCount, bulletinStats, publishTargets, type BulletinInput,
} from "@/lib/domain/bulletins";
import { seedUpdates } from "@/lib/seed/updates";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { seeded, userByEmail } from "./helpers";

const base = (over: Partial<BulletinInput> = {}): BulletinInput => ({
  title: "Test circular",
  body: "Line one\n\nLine two",
  category: "circular",
  stationId: null,
  effectiveDate: null,
  reference: null,
  isPinned: false,
  requiresAck: false,
  ...over,
});

describe("updates (bulletins)", () => {
  beforeAll(() => seeded());

  it("seeds sample updates idempotently", () => {
    const first = seedUpdates();
    expect(first).toBeGreaterThanOrEqual(4);
    expect(seedUpdates()).toBe(0);
    const titles = all<{ title: string; body: string }>("SELECT title, body FROM bulletins WHERE reference LIKE 'SAMPLE/%'");
    for (const t of titles) expect(t.body).toMatch(/SAMPLE/);
  });

  it("system admin can publish to all stations and everyone gets notified", () => {
    const sys = userByEmail("sysadmin@firstrecord.example");
    expect(publishTargets(sys)[0].id).toBeNull();
    const officer = userByEmail("officer.rao@central.example");
    const remote = userByEmail("officer.das@riverside.example");
    const before = unreadBulletinCount(officer.id);
    const id = createBulletin(sys, base({ title: "All-station rule", category: "new_rule" }));
    expect(unreadBulletinCount(officer.id)).toBe(before + 1);
    for (const u of [officer, remote]) {
      const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND entity_type = 'bulletin' AND entity_id = ?", u.id, id)!.n;
      expect(n).toBe(1);
    }
    // publisher is not notified about their own update and counts as read
    expect(get("SELECT 1 FROM notifications WHERE user_id = ? AND entity_id = ?", sys.id, id)).toBeUndefined();
    const audited = get("SELECT 1 FROM audit_events WHERE action = 'bulletin.published' AND entity_id = ?", id);
    expect(audited).toBeTruthy();
  });

  it("station admins may publish only to their own station", () => {
    const admin = userByEmail("admin@central.example");
    const remoteAdmin = userByEmail("admin@riverside.example");
    expect(publishTargets(admin)).toEqual([{ id: admin.stationId, name: admin.stationName }]);
    expect(() => createBulletin(admin, base({ stationId: null }))).toThrow(ForbiddenError);
    expect(() => createBulletin(admin, base({ stationId: remoteAdmin.stationId }))).toThrow(ForbiddenError);
    const id = createBulletin(admin, base({ stationId: admin.stationId, title: "Central only" }));

    // not visible to another station
    const remote = userByEmail("officer.das@riverside.example");
    expect(() => getBulletin(remote, id)).toThrow(NotFoundError);
    expect(listBulletins(remote).some((b) => b.id === id)).toBe(false);
    // other station's admin cannot edit it
    expect(() => updateBulletin(remoteAdmin, id, base({ stationId: remoteAdmin.stationId }))).toThrow(ForbiddenError);
  });

  it("non-publishers cannot publish", () => {
    const officer = userByEmail("officer.rao@central.example");
    expect(() => createBulletin(officer, base())).toThrow(ForbiddenError);
    expect(publishTargets(officer)).toEqual([]);
  });

  it("pinned first, read tracking and acknowledgement", () => {
    const admin = userByEmail("admin@central.example");
    const officer = userByEmail("officer.khan@central.example");
    const pinned = createBulletin(admin, base({ stationId: admin.stationId, title: "Pinned ack", isPinned: true, requiresAck: true }));
    createBulletin(admin, base({ stationId: admin.stationId, title: "Newer, not pinned" }));
    const feed = listBulletins(officer);
    expect(feed.findIndex((b) => b.id === pinned)).toBeLessThan(feed.findIndex((b) => b.title === "Newer, not pinned"));

    const unread = unreadBulletinCount(officer.id);
    markBulletinRead(officer, pinned);
    expect(unreadBulletinCount(officer.id)).toBe(unread - 1);
    expect(get<{ r: string | null }>("SELECT read_at AS r FROM notifications WHERE user_id = ? AND entity_id = ?", officer.id, pinned)!.r).not.toBeNull();

    let stats = bulletinStats(admin, pinned);
    expect(stats.pending.some((p) => p.id === officer.id)).toBe(true);
    acknowledgeBulletin(officer, pinned);
    acknowledgeBulletin(officer, pinned); // idempotent
    stats = bulletinStats(admin, pinned);
    expect(stats.pending.some((p) => p.id === officer.id)).toBe(false);
    expect(stats.acknowledged).toBeGreaterThanOrEqual(2); // publisher + officer
    expect(() => bulletinStats(officer, pinned)).toThrow(ForbiddenError);
  });

  it("acknowledging an update that does not ask for it is rejected", () => {
    const admin = userByEmail("admin@central.example");
    const officer = userByEmail("officer.rao@central.example");
    const id = createBulletin(admin, base({ stationId: admin.stationId }));
    expect(() => acknowledgeBulletin(officer, id)).toThrow(ValidationError);
  });

  it("archived updates disappear for staff and cannot be edited", () => {
    const admin = userByEmail("admin@central.example");
    const officer = userByEmail("officer.rao@central.example");
    const id = createBulletin(admin, base({ stationId: admin.stationId, title: "To archive" }));
    archiveBulletin(admin, id);
    expect(listBulletins(officer).some((b) => b.id === id)).toBe(false);
    expect(() => getBulletin(officer, id)).toThrow(NotFoundError);
    expect(listBulletins(admin, { archived: true }).some((b) => b.id === id)).toBe(true);
    expect(listBulletins(officer, { archived: true })).toEqual([]);
    expect(() => updateBulletin(admin, id, base({ stationId: admin.stationId }))).toThrow(ValidationError);
    expect(get("SELECT 1 FROM audit_events WHERE action = 'bulletin.archived' AND entity_id = ?", id)).toBeTruthy();
  });

  it("audit entries never contain the bulletin body", () => {
    const sys = userByEmail("sysadmin@firstrecord.example");
    const id = createBulletin(sys, base({ body: "SECRET-BODY-TEXT do not log" }));
    const rows = all<{ summary: string; metadata: string }>("SELECT summary, metadata FROM audit_events WHERE entity_id = ?", id);
    for (const r of rows) expect(r.summary + r.metadata).not.toContain("SECRET-BODY-TEXT");
  });
});
