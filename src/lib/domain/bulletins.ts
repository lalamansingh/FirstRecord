/**
 * Updates: new rules, circulars, advisories and system updates published to staff.
 *
 * Visibility: a user sees bulletins for all stations (station_id NULL) plus those
 * for their own station. Users without a station (organisation-level accounts)
 * see every bulletin.
 *
 * Publishing (bulletin.publish): a station-linked publisher may only target their
 * own station; an organisation-level publisher (no station) may target any
 * station or all stations. Bulletins summarise rules for staff awareness — they
 * are not the official text of any law or circular.
 */
import { all, get, insert, newId, now, run, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can, assertCan, type AuthUser } from "@/lib/rbac/access";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const BULLETIN_CATEGORIES = ["new_rule", "circular", "advisory", "system_update"] as const;
export type BulletinCategory = (typeof BULLETIN_CATEGORIES)[number];

export const BULLETIN_CATEGORY_LABELS = {
  new_rule: "New rule",
  circular: "Circular",
  advisory: "Advisory",
  system_update: "System update",
} as const satisfies Record<BulletinCategory, string>;

export function isBulletinCategory(v: unknown): v is BulletinCategory {
  return typeof v === "string" && (BULLETIN_CATEGORIES as readonly string[]).includes(v);
}

export interface BulletinRow {
  id: string;
  title: string;
  body: string;
  category: BulletinCategory;
  station_id: string | null;
  station_name: string | null;
  effective_date: string | null;
  reference: string | null;
  is_pinned: number;
  requires_ack: number;
  published_by: string;
  publisher_name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  read_at: string | null;
  acknowledged_at: string | null;
}

export interface BulletinInput {
  title: string;
  body: string;
  category: BulletinCategory;
  stationId: string | null; // null = all stations
  effectiveDate: string | null;
  reference: string | null;
  isPinned: boolean;
  requiresAck: boolean;
}

const SELECT = `
  SELECT b.id, b.title, b.body, b.category, b.station_id, s.name AS station_name, b.effective_date, b.reference,
         b.is_pinned, b.requires_ack, b.published_by, u.name AS publisher_name, b.created_at, b.updated_at, b.archived_at,
         r.read_at, r.acknowledged_at
    FROM bulletins b
    JOIN users u ON u.id = b.published_by
    LEFT JOIN stations s ON s.id = b.station_id
    LEFT JOIN bulletin_reads r ON r.bulletin_id = b.id AND r.user_id = ?`;

/** SQL fragment + params restricting bulletins to those addressed to the user's station. */
function audienceFilter(stationId: string | null): { sql: string; params: string[] } {
  if (!stationId) return { sql: "1 = 1", params: [] };
  return { sql: "(b.station_id IS NULL OR b.station_id = ?)", params: [stationId] };
}

/** Whether `user` may edit/archive a bulletin targeted at `stationId`. */
export function canManageBulletin(user: AuthUser, bulletinStationId: string | null): boolean {
  if (!can(user, "bulletin.publish")) return false;
  if (!user.stationId) return true;
  return bulletinStationId === user.stationId;
}

/** Stations the user may target when publishing. `null` in the list = all stations. */
export function publishTargets(user: AuthUser): { id: string | null; name: string }[] {
  if (!can(user, "bulletin.publish")) return [];
  if (user.stationId) return [{ id: user.stationId, name: user.stationName ?? "My station" }];
  const stations = all<{ id: string; name: string }>("SELECT id, name FROM stations ORDER BY name");
  return [{ id: null, name: "All stations" }, ...stations];
}

export function listBulletins(
  user: AuthUser,
  opts: { category?: BulletinCategory | null; archived?: boolean } = {},
): BulletinRow[] {
  const f = audienceFilter(user.stationId);
  const where = [f.sql];
  const params: (string | null)[] = [user.id, ...f.params];
  if (opts.archived) {
    // Archived bulletins are only listed to publishers, limited to the ones they manage.
    if (!can(user, "bulletin.publish")) return [];
    where.push("b.archived_at IS NOT NULL");
    if (user.stationId) {
      where.push("b.station_id = ?");
      params.push(user.stationId);
    }
  } else {
    where.push("b.archived_at IS NULL");
  }
  if (opts.category) {
    where.push("b.category = ?");
    params.push(opts.category);
  }
  return all<BulletinRow>(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${opts.archived ? "" : "b.is_pinned DESC,"} b.created_at DESC LIMIT 200`,
    ...params,
  );
}

/** Count of non-archived bulletins addressed to the user that they have not opened. */
export function unreadBulletinCount(userId: string): number {
  const u = get<{ station_id: string | null }>("SELECT station_id FROM users WHERE id = ?", userId);
  if (!u) return 0;
  const f = audienceFilter(u.station_id);
  return get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM bulletins b
       LEFT JOIN bulletin_reads r ON r.bulletin_id = b.id AND r.user_id = ?
      WHERE b.archived_at IS NULL AND r.read_at IS NULL AND ${f.sql}`,
    userId,
    ...f.params,
  )!.n;
}

/** Category counts of unarchived bulletins visible to the user (for tab badges). */
export function bulletinCategoryCounts(user: AuthUser): Record<BulletinCategory | "all", number> {
  const f = audienceFilter(user.stationId);
  const rows = all<{ category: BulletinCategory; n: number }>(
    `SELECT b.category, COUNT(*) AS n FROM bulletins b WHERE b.archived_at IS NULL AND ${f.sql} GROUP BY b.category`,
    ...f.params,
  );
  const out = { all: 0, new_rule: 0, circular: 0, advisory: 0, system_update: 0 };
  for (const r of rows) {
    out[r.category] = r.n;
    out.all += r.n;
  }
  return out;
}

/**
 * Load one bulletin for the user. Throws NotFound when it is not addressed to them
 * (or archived, unless they manage it).
 */
export function getBulletin(user: AuthUser, id: string): BulletinRow {
  const row = get<BulletinRow>(`${SELECT} WHERE b.id = ?`, user.id, id);
  if (!row) throw new NotFoundError("Update not found.");
  const addressed = !user.stationId || row.station_id === null || row.station_id === user.stationId;
  if (!addressed) throw new NotFoundError("Update not found.");
  if (row.archived_at && !canManageBulletin(user, row.station_id)) throw new NotFoundError("Update not found.");
  return row;
}

export function markBulletinRead(user: AuthUser, id: string) {
  getBulletin(user, id);
  run(
    `INSERT INTO bulletin_reads (bulletin_id, user_id, read_at) VALUES (?, ?, ?)
       ON CONFLICT (bulletin_id, user_id) DO NOTHING`,
    id,
    user.id,
    now(),
  );
  // Opening an update also clears its notification.
  run(
    "UPDATE notifications SET read_at = ? WHERE user_id = ? AND entity_type = 'bulletin' AND entity_id = ? AND read_at IS NULL",
    now(),
    user.id,
    id,
  );
}

export function acknowledgeBulletin(user: AuthUser, id: string) {
  const b = getBulletin(user, id);
  if (b.archived_at) throw new ValidationError("This update has been archived.");
  if (!b.requires_ack) throw new ValidationError("This update does not ask for acknowledgement.");
  const t = now();
  run(
    `INSERT INTO bulletin_reads (bulletin_id, user_id, read_at, acknowledged_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (bulletin_id, user_id) DO UPDATE SET acknowledged_at = COALESCE(acknowledged_at, excluded.acknowledged_at)`,
    id,
    user.id,
    t,
    t,
  );
  audit({ actorId: user.id, action: "bulletin.acknowledged", entityType: "bulletin", entityId: id, summary: `Acknowledged update "${b.title}"` });
}

function validateTarget(user: AuthUser, stationId: string | null) {
  if (user.stationId) {
    if (stationId !== user.stationId) throw new ForbiddenError("You can only publish updates for your own station.");
  } else if (stationId && !get("SELECT 1 FROM stations WHERE id = ?", stationId)) {
    throw new ValidationError("Unknown station.", { stationId: "Choose a station" });
  }
}

/** Active users who receive a bulletin targeted at `stationId` (null = everyone). */
export function bulletinAudience(stationId: string | null): { id: string; name: string; role_name: string; station_name: string | null }[] {
  return all(
    `SELECT u.id, u.name, r.name AS role_name, s.name AS station_name FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN stations s ON s.id = u.station_id
      WHERE u.status = 'active' AND (? IS NULL OR u.station_id = ? OR u.station_id IS NULL)
      ORDER BY u.name`,
    stationId,
    stationId,
  );
}

export function createBulletin(user: AuthUser, input: BulletinInput): string {
  assertCan(user, "bulletin.publish");
  validateTarget(user, input.stationId);
  const id = newId();
  const t = now();
  tx(() => {
    insert("bulletins", {
      id,
      title: input.title,
      body: input.body,
      category: input.category,
      station_id: input.stationId,
      effective_date: input.effectiveDate,
      reference: input.reference,
      is_pinned: input.isPinned ? 1 : 0,
      requires_ack: input.requiresAck ? 1 : 0,
      published_by: user.id,
      created_at: t,
      updated_at: t,
      archived_at: null,
    });
    // The publisher has obviously read it.
    insert("bulletin_reads", { bulletin_id: id, user_id: user.id, read_at: t, acknowledged_at: input.requiresAck ? t : null });
    const label = BULLETIN_CATEGORY_LABELS[input.category];
    for (const u of bulletinAudience(input.stationId)) {
      if (u.id === user.id) continue;
      insert("notifications", {
        id: newId(),
        user_id: u.id,
        kind: "bulletin",
        title: `${label}: ${input.title}`.slice(0, 200),
        link: `/updates/${id}`,
        entity_type: "bulletin",
        entity_id: id,
        read_at: null,
        created_at: t,
      });
    }
    audit({
      actorId: user.id,
      action: "bulletin.published",
      entityType: "bulletin",
      entityId: id,
      summary: `Published ${label.toLowerCase()} "${input.title}"`,
      metadata: { category: input.category, stationId: input.stationId ?? "all", requiresAck: input.requiresAck },
    });
  });
  return id;
}

function loadForManage(user: AuthUser, id: string) {
  assertCan(user, "bulletin.publish");
  const b = get<{ id: string; station_id: string | null; title: string; archived_at: string | null }>(
    "SELECT id, station_id, title, archived_at FROM bulletins WHERE id = ?",
    id,
  );
  if (!b) throw new NotFoundError("Update not found.");
  if (!canManageBulletin(user, b.station_id)) throw new ForbiddenError("You can only manage updates published for your own station.");
  return b;
}

export function updateBulletin(user: AuthUser, id: string, input: BulletinInput) {
  const b = loadForManage(user, id);
  if (b.archived_at) throw new ValidationError("Archived updates cannot be edited.");
  validateTarget(user, input.stationId);
  update("bulletins", id, {
    title: input.title,
    body: input.body,
    category: input.category,
    station_id: input.stationId,
    effective_date: input.effectiveDate,
    reference: input.reference,
    is_pinned: input.isPinned ? 1 : 0,
    requires_ack: input.requiresAck ? 1 : 0,
    updated_at: now(),
  });
  audit({
    actorId: user.id,
    action: "bulletin.edited",
    entityType: "bulletin",
    entityId: id,
    summary: `Edited update "${input.title}"`,
    metadata: { category: input.category, stationId: input.stationId ?? "all" },
  });
}

export function archiveBulletin(user: AuthUser, id: string) {
  const b = loadForManage(user, id);
  if (b.archived_at) return;
  update("bulletins", id, { archived_at: now(), is_pinned: 0, updated_at: now() });
  audit({ actorId: user.id, action: "bulletin.archived", entityType: "bulletin", entityId: id, summary: `Archived update "${b.title}"` });
}

export interface BulletinStats {
  audience: number;
  read: number;
  acknowledged: number;
  pending: { id: string; name: string; role_name: string; station_name: string | null; read_at: string | null }[];
}

/** Read / acknowledgement statistics for publishers who manage the bulletin. */
export function bulletinStats(user: AuthUser, id: string): BulletinStats {
  const b = loadForManage(user, id);
  const audience = bulletinAudience(b.station_id);
  const reads = new Map(
    all<{ user_id: string; read_at: string; acknowledged_at: string | null }>(
      "SELECT user_id, read_at, acknowledged_at FROM bulletin_reads WHERE bulletin_id = ?",
      id,
    ).map((r) => [r.user_id, r]),
  );
  const requiresAck = !!get<{ r: number }>("SELECT requires_ack AS r FROM bulletins WHERE id = ?", id)?.r;
  let read = 0;
  let acknowledged = 0;
  const pending: BulletinStats["pending"] = [];
  for (const u of audience) {
    const r = reads.get(u.id);
    if (r) read++;
    if (r?.acknowledged_at) acknowledged++;
    const done = requiresAck ? !!r?.acknowledged_at : !!r;
    if (!done) pending.push({ ...u, read_at: r?.read_at ?? null });
  }
  return { audience: audience.length, read, acknowledged, pending };
}
