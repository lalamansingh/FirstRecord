/**
 * Fictional sample Updates (bulletins) for demos. Every item is clearly marked as
 * a sample; none of it describes a real law, circular or authority. Idempotent:
 * does nothing if sample bulletins already exist.
 */
import { get, insert, newId } from "@/lib/db";

const SAMPLE_PREFIX = "SAMPLE/";

export function seedUpdates(): number {
  if (get("SELECT 1 FROM bulletins WHERE reference LIKE ? LIMIT 1", `${SAMPLE_PREFIX}%`)) return 0;

  const orgPublisher = get<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.key = 'system_admin' ORDER BY u.created_at LIMIT 1`,
  );
  const stationAdmin = get<{ id: string; station_id: string }>(
    `SELECT u.id, u.station_id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.key = 'station_admin' AND u.station_id IS NOT NULL ORDER BY u.created_at LIMIT 1`,
  );
  const publisher = orgPublisher?.id ?? stationAdmin?.id;
  if (!publisher) return 0;

  const day = 24 * 3600 * 1000;
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
  const date = (daysFromNow: number) => new Date(Date.now() + daysFromNow * day).toISOString().slice(0, 10);

  const items: {
    title: string;
    body: string;
    category: "new_rule" | "circular" | "advisory" | "system_update";
    station?: boolean;
    effective?: string | null;
    ref: string;
    pinned?: boolean;
    ack?: boolean;
    daysAgo: number;
  }[] = [
    {
      title: "Sample rule: acknowledge e-complaints within 24 hours",
      body:
        "SAMPLE — fictional rule for demonstration only.\n\n" +
        "Online complaints received through the public form should be opened and moved to \"Under verification\" within 24 hours of submission.\n\n" +
        "If a complaint cannot be verified, record the reason and send the complainant a plain-language status note.\n\n" +
        "This summary is not the text of any official instruction.",
      category: "new_rule",
      effective: date(3),
      ref: `${SAMPLE_PREFIX}RULE/2026/014`,
      pinned: true,
      ack: true,
      daysAgo: 1,
    },
    {
      title: "Sample circular: updated case-numbering format from next month",
      body:
        "SAMPLE — fictional circular for demonstration only.\n\n" +
        "Station administrators should review the case-numbering format under Settings → Station before the start of next month.\n\n" +
        "No existing case references change.",
      category: "circular",
      effective: date(10),
      ref: `${SAMPLE_PREFIX}CIRC/2026/031`,
      daysAgo: 3,
    },
    {
      title: "Sample advisory: online purchase fraud using fake delivery links",
      body:
        "SAMPLE — fictional advisory for demonstration only.\n\n" +
        "Several fictional reports describe messages with fake parcel-delivery links that ask for a small \"re-delivery fee\".\n\n" +
        "When taking such statements, record the message text exactly as the complainant shows it and note the date and time received.",
      category: "advisory",
      ref: `${SAMPLE_PREFIX}ADV/2026/007`,
      daysAgo: 5,
    },
    {
      title: "System update: Hindi interface and language selector",
      body:
        "SAMPLE — demonstration notice.\n\n" +
        "The interface language can now be changed from the selector in the top bar. Your choice is remembered on this device.\n\n" +
        "Translations should be checked by a qualified translator before deployment.",
      category: "system_update",
      ref: `${SAMPLE_PREFIX}SYS/2026/002`,
      daysAgo: 8,
    },
    {
      title: "Sample station notice: night-duty handover checklist",
      body:
        "SAMPLE — fictional station notice for demonstration only.\n\n" +
        "Before handover, confirm open tasks due in the next 12 hours and note any pending read-backs in the case notes.",
      category: "circular",
      station: true,
      ref: `${SAMPLE_PREFIX}STN/2026/003`,
      ack: true,
      daysAgo: 2,
    },
  ];

  let n = 0;
  for (const it of items) {
    if (it.station && !stationAdmin) continue;
    const t = at(it.daysAgo);
    insert("bulletins", {
      id: newId(),
      title: it.title,
      body: it.body,
      category: it.category,
      station_id: it.station ? stationAdmin!.station_id : null,
      effective_date: it.effective ?? null,
      reference: it.ref,
      is_pinned: it.pinned ? 1 : 0,
      requires_ack: it.ack ? 1 : 0,
      published_by: it.station ? stationAdmin!.id : publisher,
      created_at: t,
      updated_at: t,
      archived_at: null,
    });
    n++;
  }
  return n;
}
