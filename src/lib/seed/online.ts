/**
 * Fictional online complaints for demos and tests. All names, places and phone
 * numbers (00000-07xxx) are invented. Idempotent: does nothing if the demo
 * complaints already exist.
 *
 * Demo tracking lookups: FR-ON-DEMO0001 with phone 00000-07001 (and so on).
 */
import { all, get, insert, newId } from "@/lib/db";
import { DEFAULT_PUBLIC_NOTES, type OnlineStatus } from "@/lib/domain/online-complaints";

interface SeedComplaint {
  name: string;
  incidentType: string;
  location: string;
  description: string;
  status: OnlineStatus;
  publicNote?: string;
  notes?: string;
  station: 0 | 1;
  daysAgo: number;
  language?: string;
}

const COMPLAINTS: SeedComplaint[] = [
  {
    name: "Neha Example",
    incidentType: "Cyber fraud",
    location: "Online — payment app, Sampleganj",
    description:
      "I received a call from someone claiming to be from my bank. They asked me to share a one-time code to 'stop a blocked transaction'. After I shared it, two payments were made from my account to an unknown recipient.",
    status: "submitted",
    station: 0,
    daysAgo: 0,
  },
  {
    name: "Rohan Sample",
    incidentType: "Vehicle theft",
    location: "Parking area near Example Market, Sampleganj",
    description:
      "I parked my blue scooter outside Example Market at about 7 pm and went shopping. When I came back around 8 pm the scooter was gone. The parking attendant did not see anyone take it.",
    status: "under_verification",
    notes: "Called complainant; vehicle registration papers to be checked at the desk.",
    station: 0,
    daysAgo: 1,
  },
  {
    name: "Farah Testwala",
    incidentType: "Lost property",
    location: "Bus stop, Example Road, Sampleganj",
    description:
      "I lost my handbag at the Example Road bus stop this morning. It had my identity card, a phone charger and some cash. I would like a record of the loss for replacing my identity card.",
    status: "verified",
    notes: "Details confirmed by phone.",
    station: 0,
    daysAgo: 2,
  },
  {
    name: "Mohan Placeholder",
    incidentType: "Harassment",
    location: "Lane 4, Sample Colony",
    description:
      "A neighbour has been repeatedly playing very loud music late at night and shouting at my family when we ask him to lower it. This has happened every night for the last week.",
    status: "rejected",
    publicNote: "This matter is better handled through the local community mediation desk. Please visit the station if it continues.",
    station: 0,
    daysAgo: 4,
  },
  {
    name: "Kiran Demo",
    incidentType: "Theft",
    location: "Riverside Weekly Market",
    description:
      "My mobile phone was taken from my bag while I was shopping at the weekly market on Sunday afternoon. I noticed it was missing about ten minutes after I left the vegetable stalls.",
    status: "submitted",
    station: 1,
    daysAgo: 0,
    language: "hi",
  },
];

export function seedOnlineComplaints(): number {
  if (get("SELECT 1 FROM online_complaints WHERE tracking_code = 'FR-ON-DEMO0001'")) return 0;
  const stations = all<{ id: string }>("SELECT id FROM stations ORDER BY created_at, code");
  if (stations.length === 0) return 0;
  let n = 0;
  COMPLAINTS.forEach((c, i) => {
    const station = stations[Math.min(c.station, stations.length - 1)];
    const verifier = get<{ id: string }>(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.station_id = ? AND r.permissions LIKE '%"online.verify"%' ORDER BY u.email LIMIT 1`,
      station.id,
    );
    const created = new Date(Date.now() - c.daysAgo * 86_400_000 - (i + 1) * 3_600_000).toISOString();
    const isVerified = c.status === "verified";
    insert("online_complaints", {
      id: newId(),
      tracking_code: `FR-ON-DEMO${String(i + 1).padStart(4, "0")}`,
      station_id: station.id,
      complainant_name: c.name,
      phone: `00000-07${String(i + 1).padStart(3, "0")}`,
      email: null,
      address: `${i + 10} Example Road, Sampleganj`,
      incident_type: c.incidentType,
      incident_date: new Date(Date.parse(created) - 6 * 3_600_000).toISOString(),
      incident_location: c.location,
      description: c.description,
      language: c.language ?? "en",
      status: c.status,
      public_note: c.publicNote ?? (c.status === "submitted" ? null : DEFAULT_PUBLIC_NOTES[c.status]),
      verification_notes: c.notes ?? null,
      assigned_to: c.status === "under_verification" || isVerified ? (verifier?.id ?? null) : null,
      verified_by: isVerified ? (verifier?.id ?? null) : null,
      verified_at: isVerified ? created : null,
      submitter_hash: null,
      created_at: created,
      updated_at: created,
    });
    n++;
  });
  return n;
}
