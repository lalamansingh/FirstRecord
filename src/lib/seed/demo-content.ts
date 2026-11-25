/**
 * Fictional demo content for FirstRecord.
 *
 * EVERYTHING HERE IS INVENTED: people, places, phone numbers (00000-0xxxx),
 * stations and events. Do not replace with real data. Demo content contains no
 * audio/video recordings — the recording workflow can be tried live in the app.
 */
import { insert, newId, run, get } from "@/lib/db";
import { DEFAULT_CASE_WORKFLOW, DEFAULT_TASK_WORKFLOW, formatCaseReference } from "@/lib/domain/workflow";
import type { BaseSeedResult } from "./base";
import { DEFAULT_TEMPLATE_FIELDS } from "./base";
import { DEFAULT_SETTINGS } from "@/lib/domain/workflow";
import type { DraftFields, SourceRef } from "@/lib/ai/types";

/** Internal builder shape; converted to the app's DraftFields (SourceRef with offsets) by toDraftFields(). */
interface DemoDraftField {
  value: string | string[];
  status: "provided" | "not_provided" | "needs_confirmation";
  origin: "ai" | "demo" | "human";
  sources: { quote: string; transcriptVersion: number }[];
}

function toDraftFields(fields: Record<string, DemoDraftField>, text: string): DraftFields {
  const out: DraftFields = {};
  for (const [k, f] of Object.entries(fields)) {
    const sources: SourceRef[] = [];
    for (const s of f.sources) {
      const start = text.indexOf(s.quote);
      if (start >= 0) sources.push({ kind: "transcript", quote: s.quote, start, end: start + s.quote.length, transcriptVersion: s.transcriptVersion });
    }
    out[k] = { value: f.value, status: f.status, origin: f.origin, sources };
  }
  return out;
}

/* Deterministic PRNG so the demo looks the same every reset. */
let seed = 20261125;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)];
}

const DAY = 86400000;
function daysAgo(d: number, hour = 10) {
  const t = new Date(Date.now() - d * DAY);
  t.setUTCHours(hour - 5, Math.floor(rand() * 59), 0, 0); // roughly IST working hours
  return t;
}
const iso = (d: Date) => d.toISOString();

interface Story {
  type: string;
  title: (p: string) => string;
  location: string;
  text: (name: string, when: string) => string;
  persons: string[];
  property: string[];
  witnesses: string[];
}

const STORIES: Story[] = [
  {
    type: "Vehicle theft",
    title: () => "Two-wheeler reported missing from residential parking",
    location: "Parking area, Block C, Example Road, Sampleganj",
    text: (n, w) =>
      `My name is ${n}. I parked my blue scooter in the Block C parking area on ${w} at around 9 in the night. When I came down the next morning at about 7, the scooter was not there. The registration number is DEMO-01-XX-0001. I did not give the key to anyone. The building guard said he did not see anyone take it. I asked my neighbours but nobody knows anything.`,
    persons: [],
    property: ["Blue scooter, registration DEMO-01-XX-0001"],
    witnesses: ["Building guard (name not provided)"],
  },
  {
    type: "Theft",
    title: () => "Mobile phone taken at market",
    location: "Vegetable market, Sample Lane, Sampleganj",
    text: (n, w) =>
      `I am ${n}. On ${w} in the evening I was buying vegetables at the market on Sample Lane. My phone was in my bag. After paying I noticed the bag was open and the phone was gone. It is a black phone with a cracked back cover. I think it happened between 6 and 6:30 but I am not sure. There was a big crowd. A shopkeeper told me he saw a young man in a red cap walking away fast.`,
    persons: ["Young man in a red cap (as described by a shopkeeper)"],
    property: ["Black mobile phone with cracked back cover"],
    witnesses: ["Shopkeeper at the market (name not provided)"],
  },
  {
    type: "Cyber fraud",
    title: () => "Money lost after call claiming to be from a bank",
    location: "Complainant's residence (by phone), Sampleganj",
    text: (n, w) =>
      `My name is ${n}. On ${w} I received a call from a person who said he was from my bank. He said my card would be blocked. He asked me for the code that came on my phone and I told him. After that two amounts were taken from my account, one of 4,000 rupees and one of 6,500 rupees. The caller's number was 00000-09999. I called my bank the same day and they blocked the card.`,
    persons: ["Unknown caller claiming to be a bank employee"],
    property: ["Rs 4,000 and Rs 6,500 debited from bank account"],
    witnesses: [],
  },
  {
    type: "Lost property",
    title: () => "Documents folder lost during bus journey",
    location: "Sampleganj bus route 12 (exact stop not known)",
    text: (n, w) =>
      `I am ${n}. On ${w} I travelled on bus route 12 from the central stop. I had a brown folder with my certificates and an identity card. When I got down I realised the folder was not with me. I do not know if I left it on the seat or if it fell. I need a report so that I can apply for duplicate documents.`,
    persons: [],
    property: ["Brown folder containing certificates and an identity card"],
    witnesses: [],
  },
  {
    type: "Burglary",
    title: () => "Shop lock found broken in the morning",
    location: "Shop No. 4, Example Road market, Sampleganj",
    text: (n, w) =>
      `My name is ${n} and I run a small stationery shop. I closed the shop on ${w} at 9 at night and locked it. In the morning my helper called me and said the lock was broken. When I reached, the cash drawer was open and about 12,000 rupees was missing. Some boxes were also moved. Nothing else seems to be missing but I am still checking. There is a camera at the shop next door.`,
    persons: [],
    property: ["Approx. Rs 12,000 cash from drawer", "Broken shutter lock"],
    witnesses: ["Shop helper (name not provided)", "Owner of the neighbouring shop with a camera"],
  },
  {
    type: "Harassment",
    title: () => "Repeated unwanted messages from unknown number",
    location: "Online / phone, Sampleganj",
    text: (n, w) =>
      `I am ${n}. Since ${w} I have been getting messages every day from a number I do not know, 00000-08888. The messages are rude and ask me to meet. I blocked the number but messages started from another number. I have kept screenshots. I do not know who is sending them.`,
    persons: ["Unknown sender using numbers 00000-08888 and another number"],
    property: [],
    witnesses: [],
  },
  {
    type: "Property damage",
    title: () => "Parked car window found broken",
    location: "Roadside near Sample Park gate 2, Sampleganj",
    text: (n, w) =>
      `My name is ${n}. On ${w} I parked my car near gate 2 of Sample Park at about 5 in the evening. When I came back at 7 the rear window was broken. Nothing was taken from inside as far as I can tell. A tea seller nearby said he heard a noise but did not see who did it.`,
    persons: [],
    property: ["Car rear window glass"],
    witnesses: ["Tea seller near gate 2 (name not provided)"],
  },
  {
    type: "Cheating / Fraud",
    title: () => "Advance paid for furniture never delivered",
    location: "Online marketplace transaction, Sampleganj",
    text: (n, w) =>
      `I am ${n}. I saw an advertisement for a sofa set online and spoke to the seller who said his name was Sample Seller. On ${w} I paid an advance of 8,000 rupees by bank transfer. He promised delivery in three days. After that his phone was switched off and the advertisement was removed. I have the payment receipt and the chat.`,
    persons: ["Seller who gave the name 'Sample Seller'"],
    property: ["Rs 8,000 advance paid by bank transfer"],
    witnesses: [],
  },
];

const FIRST = ["Anil", "Priya", "Rohan", "Neha", "Suresh", "Divya", "Karan", "Pooja", "Manoj", "Lata", "Imran", "Fatima", "Joseph", "Grace", "Harpreet", "Simran", "Gopal", "Rekha", "Tarun", "Bina"];
const LAST = ["Example", "Sample", "Testkar", "Namewala", "Placeholder", "Fictiv", "Mockrao", "Stubbs"];
const WITNESS_NAMES = ["Witness Ramesh Sample", "Witness Anita Example", "Witness Kabir Testkar", "Witness Leela Namewala"];

const CASE_PLAN: { status: string; priority: string; station: 0 | 1; days: number }[] = [
  { status: "received", priority: "medium", station: 0, days: 1 },
  { status: "received", priority: "high", station: 0, days: 2 },
  { status: "received", priority: "low", station: 1, days: 3 },
  { status: "statement_review", priority: "medium", station: 0, days: 4 },
  { status: "statement_review", priority: "urgent", station: 0, days: 5 },
  { status: "statement_review", priority: "medium", station: 1, days: 6 },
  { status: "draft_prepared", priority: "high", station: 0, days: 8 },
  { status: "draft_prepared", priority: "medium", station: 0, days: 10 }, // clarification requested
  { status: "draft_prepared", priority: "low", station: 1, days: 12 },
  { status: "officer_review", priority: "high", station: 0, days: 14 },
  { status: "officer_review", priority: "medium", station: 0, days: 17 },
  { status: "officer_review", priority: "urgent", station: 1, days: 20 },
  { status: "investigation", priority: "high", station: 0, days: 24 },
  { status: "investigation", priority: "medium", station: 0, days: 29 },
  { status: "investigation", priority: "medium", station: 0, days: 35 },
  { status: "investigation", priority: "low", station: 1, days: 40 },
  { status: "investigation", priority: "high", station: 1, days: 46 },
  { status: "closed", priority: "low", station: 0, days: 52 },
  { status: "closed", priority: "medium", station: 0, days: 58 },
  { status: "closed", priority: "medium", station: 0, days: 64 },
  { status: "closed", priority: "low", station: 1, days: 70 },
  { status: "closed", priority: "high", station: 0, days: 77 },
  { status: "closed", priority: "medium", station: 1, days: 83 },
  { status: "closed", priority: "low", station: 0, days: 89 },
];

const NEXT_ACTIONS: Record<string, string> = {
  received: "Review intake and confirm statement transcript",
  statement_review: "Confirm transcript with complainant",
  draft_prepared: "Officer to review FIR draft",
  officer_review: "Complete officer review of draft",
  investigation: "Follow up on pending enquiries",
  closed: "",
};

const HINDI_STATEMENT =
  "मेरा नाम लता एग्ज़ाम्पल है। मैं डेमो सिटी में एग्ज़ाम्पल रोड पर रहती हूँ। कल शाम लगभग सात बजे मैं सैंपल लेन के बाज़ार में थी। वहाँ भीड़ में किसी ने मेरा पर्स ले लिया। पर्स भूरे रंग का था और उसमें लगभग दो हज़ार रुपये और एक पहचान पत्र था। मैंने किसी को देखा नहीं। एक दुकानदार ने कहा कि उसने एक आदमी को तेज़ी से जाते हुए देखा था।";

function audit(actor: string | null, action: string, entityType: string, entityId: string, caseId: string | null, summary: string, at: Date) {
  insert("audit_events", {
    id: newId(),
    actor_id: actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    case_id: caseId,
    summary,
    metadata: JSON.stringify({ demo: true }),
    ip: null,
    created_at: iso(at),
  });
}

/** Return the sentence containing `needle`, verbatim from text (or the needle itself). */
function quoteFrom(text: string, needle: string): string {
  const sentences = text.split(/(?<=[.।?!])\s+/);
  return sentences.find((s) => s.includes(needle)) ?? needle;
}

function buildDraftFields(story: Story, text: string, name: string, when: string): Record<string, DemoDraftField> {
  const f: Record<string, DemoDraftField> = {};
  const src = (needle: string) => [{ quote: quoteFrom(text, needle), transcriptVersion: 1 }];
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  f.informant = { value: name, status: "provided", origin: "demo", sources: src(name) };
  const timeSentence = sentences.find((s) => /\b(at|around|between|evening|night|morning)\b/i.test(s));
  f.incident_datetime = timeSentence
    ? { value: `${when} — ${timeSentence.replace(/^.*?(at|around|between|in the)/i, "$1")}`, status: /not sure|about|around/i.test(timeSentence) ? "needs_confirmation" : "provided", origin: "demo", sources: [{ quote: timeSentence, transcriptVersion: 1 }] }
    : { value: when, status: "needs_confirmation", origin: "demo", sources: src(when) };
  f.incident_place = { value: story.location, status: "needs_confirmation", origin: "demo", sources: [{ quote: sentences[1] ?? sentences[0], transcriptVersion: 1 }] };
  f.incident_type = { value: story.type.toLowerCase() + " (as described; not a legal classification)", status: "provided", origin: "demo", sources: [{ quote: sentences[1] ?? sentences[0], transcriptVersion: 1 }] };
  f.account_summary = {
    value: `[Assistant summary (rule-based) — verify against the statement] The informant states: ${sentences.slice(1, 4).join(" ")}`,
    status: "provided",
    origin: "demo",
    sources: sentences.slice(1, 4).map((q) => ({ quote: q, transcriptVersion: 1 })),
  };
  f.chronology = { value: sentences.slice(1, 6), status: "provided", origin: "demo", sources: sentences.slice(1, 6).map((q) => ({ quote: q, transcriptVersion: 1 })) };
  f.verbatim_extracts = { value: sentences.slice(1, 3).map((s) => `"${s}"`), status: "provided", origin: "demo", sources: sentences.slice(1, 3).map((q) => ({ quote: q, transcriptVersion: 1 })) };
  f.persons_described = story.persons.length
    ? { value: story.persons, status: "needs_confirmation", origin: "demo", sources: [] }
    : { value: "Not provided", status: "not_provided", origin: "demo", sources: [] };
  f.property_details = story.property.length
    ? { value: story.property, status: "provided", origin: "demo", sources: [] }
    : { value: "Not provided", status: "not_provided", origin: "demo", sources: [] };
  f.witnesses = story.witnesses.length
    ? { value: story.witnesses, status: "needs_confirmation", origin: "demo", sources: [] }
    : { value: "Not provided", status: "not_provided", origin: "demo", sources: [] };
  f.delay_reason = { value: "Not provided", status: "not_provided", origin: "demo", sources: [] };
  f.legal_provisions = { value: "", status: "not_provided", origin: "human", sources: [] };
  f.officer_remarks = { value: "", status: "not_provided", origin: "human", sources: [] };
  // Ensure every template field is present.
  for (const tf of DEFAULT_TEMPLATE_FIELDS) {
    if (!f[tf.key]) f[tf.key] = { value: "Not provided", status: "not_provided", origin: "demo", sources: [] };
  }
  // Fill sources for list fields from verbatim text where the item text appears.
  for (const key of ["property_details", "witnesses", "persons_described"]) {
    const fld = f[key];
    if (Array.isArray(fld.value)) {
      fld.sources = sentences.filter((s) => (fld.value as string[]).some((v) => v.split(/[ ,(]/).filter((w) => w.length > 4).some((w) => s.toLowerCase().includes(w.toLowerCase())))).slice(0, 3).map((q) => ({ quote: q, transcriptVersion: 1 }));
    }
  }
  return f;
}

function questionsFor(fields: Record<string, DemoDraftField>): string[] {
  const q: string[] = [];
  if (fields.incident_datetime.status === "needs_confirmation") q.push("Please confirm the exact date and time of the incident.");
  if (fields.incident_place.status === "needs_confirmation") q.push("Please confirm the precise location (landmark or address).");
  if (fields.witnesses.status !== "not_provided") q.push("Can the witnesses mentioned be identified and contacted?");
  if (fields.delay_reason.status === "not_provided") q.push("Was there any delay in reporting? If so, why?");
  return q;
}

export function seedDemoContent(base: BaseSeedResult): { cases: number; tasks: number; statements: number; drafts: number; intakes: number } {
  seed = 20261125;
  const U = base.users;
  const stationStaff: Record<0 | 1, { officers: string[]; clerk: string; admin: string }> = {
    0: { officers: [U["officer.rao@central.example"], U["officer.khan@central.example"]], clerk: U["clerk@central.example"], admin: U["admin@central.example"] },
    1: { officers: [U["officer.das@riverside.example"]], clerk: U["officer.das@riverside.example"], admin: U["admin@riverside.example"] },
  };
  const stationCodes = base.stationIds.map((id) => get<{ code: string }>("SELECT code FROM stations WHERE id = ?", id)!.code);
  const seqs: Record<string, number> = {};
  const flow = DEFAULT_CASE_WORKFLOW.states.map((s) => s.key);
  const taskTypes = DEFAULT_SETTINGS["task.types"].map((t) => t.key);

  let caseCount = 0, taskCount = 0, statementCount = 0, draftCount = 0;
  const caseIds: { id: string; ref: string; station: 0 | 1; officer: string; status: string; received: Date }[] = [];

  // Assign references chronologically (oldest case gets the lowest sequence).
  const refFor: string[] = [];
  [...CASE_PLAN.keys()]
    .sort((a, b) => CASE_PLAN[b].days - CASE_PLAN[a].days)
    .forEach((i) => {
      const plan = CASE_PLAN[i];
      const d = new Date(Date.now() - plan.days * DAY);
      const key = `${base.stationIds[plan.station]}:${d.getFullYear()}`;
      seqs[key] = (seqs[key] ?? 0) + 1;
      refFor[i] = formatCaseReference("{STATION}/{YYYY}/{SEQ:5}", stationCodes[plan.station], d, seqs[key]);
    });
  for (const [key, value] of Object.entries(seqs)) {
    const [stationId, period] = key.split(":");
    insert("case_sequences", { station_id: stationId, period, last_value: value });
  }

  CASE_PLAN.forEach((plan, i) => {
    const story = STORIES[i % STORIES.length];
    const staff = stationStaff[plan.station];
    const officer = staff.officers[i % staff.officers.length];
    const creator = i % 3 === 0 ? staff.clerk : officer;
    const received = daysAgo(plan.days, 9 + (i % 7));
    const incidentDate = new Date(received.getTime() - (1 + (i % 3)) * DAY);
    const when = incidentDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    const isHindi = i === 4;
    const name = isHindi ? "Lata Example" : `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const stationId = base.stationIds[plan.station];

    const ref = refFor[i];

    const caseId = newId();
    const statementId = newId();
    const text = isHindi ? HINDI_STATEMENT : story.text(name, when);
    const stageIdx = flow.indexOf(plan.status);
    const updated = new Date(Math.min(Date.now() - 3600000, received.getTime() + (stageIdx + 1) * DAY * (0.6 + rand())));
    const closed = plan.status === "closed" ? updated : null;

    // Statement (created before the case; linked at case creation).
    const method = i % 4 === 1 ? "assisted" : "typed";
    insert("statements", {
      id: statementId,
      station_id: stationId,
      case_id: null,
      created_by: creator,
      status: "completed",
      current_step: "complete",
      intake_at: iso(received),
      incident_type: isHindi ? "Theft" : story.type,
      incident_date: iso(incidentDate),
      incident_location: isHindi ? "Sample Lane market, Sampleganj" : story.location,
      language: isHindi ? "hi" : "en",
      capture_method: method,
      accessibility_notes: method === "assisted" ? "Statement dictated; entered by staff and read back to the speaker." : null,
      interpreter_name: null,
      speaker_name: name,
      speaker_contact: `00000-0${String(1000 + i).padStart(4, "0")}`,
      speaker_address: `${10 + i} Example Road, Sampleganj`,
      speaker_role: "complainant",
      transcript_confirmed_at: stageIdx >= 1 ? iso(new Date(received.getTime() + 3600000)) : null,
      transcript_confirmed_by: stageIdx >= 1 ? officer : null,
      created_at: iso(received),
      updated_at: iso(received),
    });
    statementCount++;

    if (i === 2 || i === 9) {
      // Recording offered and declined → typed statement.
      insert("consent_events", {
        id: newId(),
        statement_id: statementId,
        scope: "audio",
        decision: "declined",
        notice_version: DEFAULT_SETTINGS["recording.notice_version"],
        notice_language: "en",
        notice_text: DEFAULT_SETTINGS["recording.notice.en"],
        recorded_by: creator,
        created_at: iso(received),
      });
    }

    insert("transcript_versions", {
      id: newId(),
      statement_id: statementId,
      version: 1,
      source: method === "assisted" ? "assisted_entry" : "typed_original",
      text,
      segments: "[]",
      language: isHindi ? "hi" : "en",
      note: method === "assisted" ? "Entered by staff as dictated" : "Original typed statement",
      uncertainty_note: null,
      recording_id: null,
      created_by: creator,
      created_at: iso(received),
    });
    if (i % 5 === 3 && !isHindi) {
      insert("transcript_versions", {
        id: newId(),
        statement_id: statementId,
        version: 2,
        source: "correction",
        text: text + " (Speaker clarified on read-back: the time given above is approximate.)",
        segments: "[]",
        language: "en",
        note: "Speaker clarification added on read-back",
        uncertainty_note: "Time of incident approximate per speaker",
        recording_id: null,
        created_by: officer,
        created_at: iso(new Date(received.getTime() + 1800000)),
      });
    }

    insert("cases", {
      id: caseId,
      reference: ref,
      station_id: stationId,
      title: isHindi ? "Purse taken in crowded market (Hindi statement)" : story.title(name),
      incident_type: isHindi ? "Theft" : story.type,
      incident_date: iso(incidentDate),
      incident_location: isHindi ? "Sample Lane market, Sampleganj" : story.location,
      summary: isHindi
        ? "Complainant reports a purse taken in a crowded market. Statement recorded in Hindi."
        : `${story.type} reported by complainant. See statement for details.`,
      status: plan.status,
      priority: plan.priority,
      assigned_to: officer,
      next_action: NEXT_ACTIONS[plan.status] || null,
      next_action_due: plan.status === "closed" ? null : iso(new Date(Date.now() + ((i % 5) - 1) * DAY)),
      official_status: "local",
      official_reference: null,
      official_confirmed_at: null,
      official_system: null,
      received_at: iso(received),
      closed_at: closed ? iso(closed) : null,
      is_demo: 1,
      created_by: creator,
      created_at: iso(received),
      updated_at: iso(updated),
    });
    run("UPDATE statements SET case_id = ? WHERE id = ?", caseId, statementId);
    caseCount++;
    audit(creator, "case.created", "case", caseId, caseId, `Case ${ref} created from intake`, received);

    insert("case_assignments", { id: newId(), case_id: caseId, user_id: officer, assignment_role: "lead", assigned_by: staff.admin, assigned_at: iso(received), ended_at: null });
    audit(staff.admin, "case.assigned", "case", caseId, caseId, `Case ${ref} assigned`, received);

    // Status history following the workflow path.
    let prev: string | null = null;
    for (let s = 0; s <= stageIdx; s++) {
      const at = new Date(received.getTime() + ((updated.getTime() - received.getTime()) * s) / Math.max(1, stageIdx));
      insert("case_status_history", { id: newId(), case_id: caseId, from_status: prev, to_status: flow[s], reason: s === 0 ? "Case created" : null, changed_by: s === 0 ? creator : officer, created_at: iso(at) });
      if (s > 0) audit(officer, "case.status_changed", "case", caseId, caseId, `Status changed to ${DEFAULT_CASE_WORKFLOW.states[s].label}`, at);
      prev = flow[s];
    }

    // Parties.
    insert("case_parties", {
      id: newId(), case_id: caseId, party_role: "complainant", name, age: String(25 + (i % 40)), gender: null,
      phone: `00000-0${String(1000 + i).padStart(4, "0")}`, address: `${10 + i} Example Road, Sampleganj`, notes: null,
      statement_id: statementId, created_by: creator, created_at: iso(received), updated_at: iso(received),
    });
    if (i % 3 === 0) {
      insert("case_parties", {
        id: newId(), case_id: caseId, party_role: "witness", name: WITNESS_NAMES[i % WITNESS_NAMES.length], age: null, gender: null,
        phone: `00000-0${String(5000 + i).padStart(4, "0")}`, address: "Example Road, Sampleganj", notes: "Mentioned by complainant; not yet contacted",
        statement_id: null, created_by: officer, created_at: iso(received), updated_at: iso(received),
      });
    }

    // Notes.
    if (stageIdx >= 1) {
      insert("case_notes", { id: newId(), case_id: caseId, author_id: officer, body: "Transcript read back to the complainant; corrections noted in a new version where needed.", created_at: iso(new Date(received.getTime() + 2 * 3600000)) });
    }
    if (plan.status === "closed") {
      insert("case_notes", { id: newId(), case_id: caseId, author_id: officer, body: "Closed after follow-up.", created_at: iso(updated) });
    }

    // Drafts for cases at draft_prepared or later.
    if (stageIdx >= 2 && !isHindi) {
      const draftId = newId();
      const fields = buildDraftFields(story, text, name, when);
      const reviewed = stageIdx >= 3;
      const clarification = i === 7;
      const draftCreated = new Date(received.getTime() + 4 * 3600000);
      insert("drafts", {
        id: draftId, statement_id: statementId, case_id: caseId, template_id: base.templateId,
        status: reviewed ? "reviewed" : clarification ? "clarification_requested" : "draft",
        current_version: reviewed ? 2 : 1,
        reviewed_by: reviewed ? officer : null, reviewed_at: reviewed ? iso(new Date(draftCreated.getTime() + DAY)) : null, reviewed_version: reviewed ? 2 : null,
        created_by: creator, created_at: iso(draftCreated), updated_at: iso(draftCreated),
      });
      insert("draft_versions", {
        id: newId(), draft_id: draftId, version: 1, fields: JSON.stringify(toDraftFields(fields, text)), questions: JSON.stringify(questionsFor(fields).map((question) => ({ question }))),
        origin: "demo", provider: "demo", model: "rule-based-v1", based_on_transcript_version: 1,
        change_summary: "Rule-based assistant draft from statement (requires human review)", created_by: creator, created_at: iso(draftCreated),
      });
      audit(creator, "draft.generated", "draft", draftId, caseId, "Draft v1 generated (rule-based assistant)", draftCreated);
      draftCount++;
      if (reviewed) {
        const v2 = JSON.parse(JSON.stringify(fields)) as Record<string, DemoDraftField>;
        v2.incident_place = { ...v2.incident_place, status: "provided", origin: "human" };
        v2.officer_remarks = { value: "Statement read over to the informant, who confirmed it as correct.", status: "provided", origin: "human", sources: [] };
        const at = new Date(draftCreated.getTime() + DAY - 3600000);
        insert("draft_versions", {
          id: newId(), draft_id: draftId, version: 2, fields: JSON.stringify(toDraftFields(v2, text)), questions: "[]", origin: "human", provider: null, model: null,
          based_on_transcript_version: 1, change_summary: "Officer confirmed place of occurrence and added remarks", created_by: officer, created_at: iso(at),
        });
        insert("reviews", { id: newId(), draft_id: draftId, draft_version: 2, reviewer_id: officer, decision: "reviewed", comment: "Checked against statement.", created_at: iso(new Date(draftCreated.getTime() + DAY)) });
        audit(officer, "draft.reviewed", "draft", draftId, caseId, "Draft v2 marked reviewed (not an official filing)", new Date(draftCreated.getTime() + DAY));
      }
      if (clarification) {
        insert("reviews", { id: newId(), draft_id: draftId, draft_version: 1, reviewer_id: officer, decision: "clarification_requested", comment: "Time of incident needs confirmation with complainant.", created_at: iso(new Date(draftCreated.getTime() + 7200000)) });
        insert("review_comments", { id: newId(), draft_id: draftId, draft_version: 1, field_key: "incident_datetime", author_id: officer, body: "Please confirm the exact time with the complainant.", resolved_at: null, resolved_by: null, created_at: iso(new Date(draftCreated.getTime() + 7200000)) });
        audit(officer, "draft.clarification_requested", "draft", draftId, caseId, "Clarification requested on draft v1", new Date(draftCreated.getTime() + 7200000));
        insert("notifications", { id: newId(), user_id: creator, kind: "clarification_requested", title: `Clarification requested on draft for ${ref}`, link: `/cases/${caseId}?tab=statement`, entity_type: "draft", entity_id: draftId, read_at: null, created_at: iso(new Date(draftCreated.getTime() + 7200000)) });
      }
    }

    insert("notifications", {
      id: newId(), user_id: officer, kind: "assignment", title: `You were assigned case ${ref}`, link: `/cases/${caseId}`,
      entity_type: "case", entity_id: caseId, read_at: plan.days > 7 ? iso(received) : null, created_at: iso(received),
    });

    caseIds.push({ id: caseId, ref, station: plan.station, officer, status: plan.status, received });
  });

  // Related-case link (not a merge).
  if (caseIds.length > 9) {
    insert("case_links", { id: newId(), case_id: caseIds[1].id, linked_case_id: caseIds[9].id, link_type: "related", note: "Similar location and time window", created_by: stationStaff[0].admin, created_at: iso(daysAgo(1)) });
  }

  // Tasks (~40).
  const TASK_TITLES = [
    "Contact witness mentioned in statement",
    "Collect copy of identity document",
    "Request camera footage from neighbouring shop",
    "Confirm time of incident with complainant",
    "Obtain bank transaction statement",
    "Site visit to location of occurrence",
    "Review FIR draft against statement",
    "Update complainant on case progress",
  ];
  const taskWf = DEFAULT_TASK_WORKFLOW.states.map((s) => s.key);
  for (let k = 0; k < 40; k++) {
    const c = caseIds[k % caseIds.length];
    const st = stationStaff[c.station];
    const assignee = k % 6 === 5 ? st.clerk : st.officers[k % st.officers.length];
    let status: string;
    let dueOffsetDays: number;
    if (c.status === "closed" || k % 5 === 0) {
      status = "done";
      dueOffsetDays = -((k % 10) + 2);
    } else if (k % 7 === 1) {
      status = "todo";
      dueOffsetDays = -((k % 4) + 1); // overdue
    } else if (k % 7 === 2) {
      status = "in_progress";
      dueOffsetDays = 0.5; // due soon
    } else if (k % 9 === 3) {
      status = "blocked";
      dueOffsetDays = 3;
    } else {
      status = pick(taskWf.filter((s) => s !== "done"));
      dueOffsetDays = 1 + (k % 9);
    }
    const created = new Date(Math.max(c.received.getTime(), Date.now() - 30 * DAY) + 3600000 * (k % 5));
    const due = new Date(Date.now() + dueOffsetDays * DAY);
    const taskId = newId();
    insert("tasks", {
      id: taskId,
      station_id: base.stationIds[c.station],
      case_id: k % 13 === 12 ? null : c.id,
      title: k % 13 === 12 ? "Prepare weekly station records summary" : TASK_TITLES[k % TASK_TITLES.length],
      description: "",
      task_type: taskTypes[k % taskTypes.length],
      status,
      priority: (["low", "medium", "high", "urgent"] as const)[k % 4],
      assignee_id: assignee,
      due_at: iso(due),
      remind_at: null,
      reminder_sent_at: null,
      completed_at: status === "done" ? iso(new Date(Math.min(Date.now(), due.getTime()))) : null,
      is_demo: 1,
      created_by: st.admin,
      created_at: iso(created),
      updated_at: iso(created),
    });
    insert("task_activity", { id: newId(), task_id: taskId, actor_id: st.admin, action: "created", detail: "Task created", created_at: iso(created) });
    if (status !== "todo") {
      insert("task_activity", { id: newId(), task_id: taskId, actor_id: assignee, action: "status_changed", detail: `Status changed to ${DEFAULT_TASK_WORKFLOW.states.find((s) => s.key === status)!.label}`, created_at: iso(new Date(created.getTime() + 3600000)) });
    }
    if (k % 4 === 0) {
      insert("task_comments", { id: newId(), task_id: taskId, author_id: assignee, body: k % 8 === 0 ? "Called once, no answer. Will try again tomorrow." : "Requested the document; awaiting response.", created_at: iso(new Date(created.getTime() + 7200000)) });
    }
    audit(st.admin, "task.created", "task", taskId, k % 13 === 12 ? null : c.id, "Task created", created);
    if (status !== "done") {
      insert("notifications", { id: newId(), user_id: assignee, kind: "task_assigned", title: `Task assigned: ${TASK_TITLES[k % TASK_TITLES.length]}`, link: `/tasks/${taskId}`, entity_type: "task", entity_id: taskId, read_at: k % 3 === 0 ? iso(created) : null, created_at: iso(created) });
    }
    taskCount++;
  }

  // In-progress intakes (saved drafts, no case yet).
  const intakes = [
    { station: 0 as const, by: stationStaff[0].clerk, step: "capture", type: "Lost property", name: "Gopal Placeholder", text: "I lost my wallet somewhere between the bus stop and the office. It had my identity card." },
    { station: 0 as const, by: U["officer.rao@central.example"], step: "intake", type: null, name: null, text: null },
    { station: 1 as const, by: U["officer.das@riverside.example"], step: "transcript", type: "Theft", name: "Bina Stubbs", text: "My bicycle was taken from outside the library on Example Road this afternoon. It is green with a basket." },
  ];
  for (const [n, it] of intakes.entries()) {
    const id = newId();
    const at = daysAgo(0, 9 + n);
    insert("statements", {
      id, station_id: base.stationIds[it.station], case_id: null, created_by: it.by, status: "in_progress", current_step: it.step,
      intake_at: iso(at), incident_type: it.type, incident_date: null, incident_location: null, language: "en",
      capture_method: it.text ? "typed" : null, accessibility_notes: null, interpreter_name: null,
      speaker_name: it.name, speaker_contact: it.name ? `00000-0${7000 + n}` : null, speaker_address: null, speaker_role: "complainant",
      transcript_confirmed_at: null, transcript_confirmed_by: null, created_at: iso(at), updated_at: iso(at),
    });
    if (it.text) {
      insert("transcript_versions", { id: newId(), statement_id: id, version: 1, source: "typed_original", text: it.text, segments: "[]", language: "en", note: "Original typed statement", uncertainty_note: null, recording_id: null, created_by: it.by, created_at: iso(at) });
    }
    audit(it.by, "statement.started", "statement", id, null, "Report intake started", at);
  }

  return { cases: caseCount, tasks: taskCount, statements: statementCount + intakes.length, drafts: draftCount, intakes: intakes.length };
}
