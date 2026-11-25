/**
 * Deterministic demo assistant. No external calls, no model. It only copies
 * verbatim sentences from the transcript into template fields using keyword
 * cues, and marks everything else "Not provided" / "Needs confirmation".
 * Output is always labelled demo-generated.
 */
import type { AIProvider, DraftField, DraftFields, DraftInput, DraftOutput, DraftQuestion, SourceRef, SourcedItem } from "./types";
import { NOT_PROVIDED, NEEDS_CONFIRMATION } from "./types";
import { splitSentences, type Sentence } from "./sources";

const CUES: Record<string, RegExp> = {
  datetime:
    /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)|o'clock|yesterday|today|last night|this morning|morning|afternoon|evening|night|midnight|noon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|around \d)\b|कल|आज|सुबह|दोपहर|शाम|रात|बजे|तारीख/i,
  place:
    /\b(at|near|outside|inside|in front of|behind|opposite|next to)\s+(the\s+)?[a-z]|\b(market|road|street|lane|colony|sector|bus stop|bus stand|station|metro|park|temple|mall|shop|school|hospital|bank|atm|house|home|flat|apartment|parking|gate|chowk|bazaar|village)\b|के पास|के सामने|बाजार|बाज़ार|सड़क|गली|घर|दुकान|स्टेशन|मंदिर/i,
  person:
    /\b(man|men|woman|women|boy|girl|person|persons|people|someone|stranger|he|she|they|wearing|tall|short|aged|years old|beard|named|called|my (brother|sister|husband|wife|son|daughter|neighbour|neighbor|friend|colleague|landlord|employer))\b|आदमी|औरत|लड़का|लड़की|व्यक्ति|लोग|पहने/i,
  property:
    /\b(phone|mobile|wallet|purse|bag|money|cash|rupees|rs\.?|₹|inr|gold|silver|chain|ring|jewellery|jewelry|watch|laptop|bike|motorcycle|scooter|scooty|car|vehicle|cycle|bicycle|documents?|card|aadhaar|licen[cs]e|keys?|imei|registration)\b|₹|मोबाइल|फोन|पर्स|रुपये|रुपए|बैग|चेन|गाड़ी|मोटरसाइकिल|स्कूटर/i,
  witness:
    /\b(saw|seen|witness|witnessed|was with me|were with me|shopkeeper|neighbou?r|passer-?by|guard|watchman|cctv)\b|देखा|गवाह|पड़ोसी|दुकानदार/i,
  sequence:
    /\b(then|after|afterwards|before|when|while|later|first|finally|suddenly|next|immediately|soon)\b|फिर|उसके बाद|जब|पहले|अचानक/i,
  delay: /\b(delay|delayed|late|could not come|couldn't come|was not able to come|waited|hospital first|afraid to report|came (today|now|here) because|only (today|now)|searching for)\b|देर|देरी/i,
};

function matching(sentences: Sentence[], re: RegExp) {
  return sentences.filter((s) => re.test(s.text));
}

function src(s: Sentence, version: number): SourceRef {
  return { kind: "transcript", quote: s.text, start: s.start, end: s.end, transcriptVersion: version };
}

function field(value: string | string[], status: DraftField["status"], sources: SourceRef[], rationale: string): DraftField {
  return { value, status, sources, origin: "demo", decision: null, rationale };
}

function notProvided(rationale = "No matching statement content found."): DraftField {
  return field(NOT_PROVIDED, "not_provided", [], rationale);
}

function listFrom(sentences: Sentence[], version: number, rationale: string, max = 8): DraftField {
  if (sentences.length === 0) return notProvided();
  const picked = sentences.slice(0, max);
  return field(
    picked.map((s) => s.text),
    "provided",
    picked.map((s) => src(s, version)),
    rationale,
  );
}

function quotes(text: string, version: number): { items: string[]; sources: SourceRef[] } {
  const items: string[] = [];
  const sources: SourceRef[] = [];
  const re = /["“]([^"”]{3,300})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    items.push(m[0]);
    sources.push({ kind: "transcript", quote: m[0], start: m.index, end: m.index + m[0].length, transcriptVersion: version });
  }
  return { items, sources };
}

export function demoExtract(input: DraftInput): DraftOutput {
  const { transcript, transcriptVersion: v, template, intake } = input;
  const sentences = splitSentences(transcript);
  const questions: DraftQuestion[] = [];

  if (sentences.length === 0) {
    const fields: DraftFields = {};
    for (const f of template) fields[f.key] = notProvided("Transcript is empty.");
    return {
      fields,
      questions: [{ question: "No statement text is available. Record or enter the account before preparing a draft." }],
      abstained: true,
      abstainReason: "The transcript is empty.",
    };
  }

  const builders: Record<string, () => DraftField> = {
    informant: () =>
      intake.speakerName
        ? field(intake.speakerName, "provided", [{ kind: "intake", field: "speaker_name", label: "Speaker name recorded at intake" }], "Copied from the intake record.")
        : field(NEEDS_CONFIRMATION, "needs_confirmation", [], "Speaker name was not recorded at intake."),
    incident_datetime: () => {
      const hits = matching(sentences, CUES.datetime);
      if (hits.length) {
        if (hits.length > 2) questions.push({ field: "incident_datetime", question: "Several time references are mentioned. Confirm the exact date and time of occurrence with the speaker." });
        return field(hits.slice(0, 2).map((s) => s.text).join(" … "), "provided", hits.slice(0, 2).map((s) => src(s, v)), "Sentences containing date/time words, copied verbatim.");
      }
      if (intake.incidentDate)
        return field(intake.incidentDate, "needs_confirmation", [{ kind: "intake", field: "incident_date", label: "Incident date entered at intake" }], "Only the intake date is available; the statement does not mention a time.");
      return field(NEEDS_CONFIRMATION, "needs_confirmation", [], "No date or time found in the statement.");
    },
    incident_place: () => {
      const hits = matching(sentences, CUES.place);
      if (hits.length) return field(hits[0].text, "provided", [src(hits[0], v)], "First sentence containing a place cue, copied verbatim.");
      if (intake.incidentLocation)
        return field(intake.incidentLocation, "needs_confirmation", [{ kind: "intake", field: "incident_location", label: "Location entered at intake" }], "Only the intake location is available.");
      return field(NEEDS_CONFIRMATION, "needs_confirmation", [], "No place found in the statement.");
    },
    incident_type: () =>
      intake.incidentType
        ? field(intake.incidentType, "needs_confirmation", [{ kind: "intake", field: "incident_type", label: "Incident type selected at intake" }], "Intake category only — not a legal classification. Confirm the description.")
        : field(NEEDS_CONFIRMATION, "needs_confirmation", [], "No incident type recorded."),
    account_summary: () => {
      const picked = sentences.slice(0, 3);
      return field(
        picked.map((s) => s.text).join(" "),
        "provided",
        picked.map((s) => src(s, v)),
        "Rule-based 'summary' is extractive: the first sentences of the account, verbatim. A real summary must be written or checked by staff.",
      );
    },
    chronology: () => {
      const hits = matching(sentences, CUES.sequence);
      return listFrom(hits.length >= 2 ? hits : sentences, v, "Sentences in the order spoken (sequence words where present), verbatim.");
    },
    verbatim_extracts: () => {
      const q = quotes(transcript, v);
      return q.items.length ? field(q.items, "provided", q.sources, "Text inside quotation marks in the transcript.") : notProvided("No quoted speech found in the transcript.");
    },
    persons_described: () => listFrom(matching(sentences, CUES.person), v, "Sentences mentioning people, verbatim. Does not infer identity or involvement.", 6),
    property_details: () => listFrom(matching(sentences, CUES.property), v, "Sentences mentioning property, verbatim.", 6),
    witnesses: () => listFrom(matching(sentences, CUES.witness), v, "Sentences mentioning someone who saw or knows of events, verbatim.", 5),
    delay_reason: () => {
      const hits = matching(sentences, CUES.delay);
      return hits.length ? field(hits.map((s) => s.text).join(" "), "provided", hits.map((s) => src(s, v)), "Sentences mentioning delay, verbatim.") : notProvided("The statement does not address any delay.");
    },
  };

  const fields: DraftFields = {};
  for (const f of template) {
    if (f.fill === "manual") {
      fields[f.key] = { value: "", status: "not_provided", sources: [], origin: "human", decision: null, rationale: f.key === "legal_provisions" ? "No approved legal source configured — to be completed by an authorized officer." : "Officer-only field." };
      continue;
    }
    const b = builders[f.key];
    fields[f.key] = b ? b() : notProvided("The rule-based assistant has no rule for this template field.");
  }

  for (const f of template) {
    const fv = fields[f.key];
    if (f.required && fv.status !== "provided" && f.fill !== "manual") {
      questions.push({ field: f.key, question: `${f.label}: not clearly stated in the account. Ask the speaker to confirm.` });
    }
  }
  return { fields, questions, abstained: false };
}

function demoChronology(input: DraftInput): SourcedItem[] {
  const f = demoExtract(input).fields.chronology;
  if (!f || f.status !== "provided" || !Array.isArray(f.value)) return [];
  return f.value.map((text, i) => ({ text, sources: f.sources[i] ? [f.sources[i]] : [] }));
}

export const demoProvider: AIProvider = {
  info: { name: "demo", model: "rule-based-v1", mode: "demo", label: "Rule-based assistant (fixed rules, not AI; no external calls)" },
  async generateDraft(input) {
    return demoExtract(input);
  },
  async summarize(input) {
    const s = splitSentences(input.transcript).slice(0, 3);
    return s.map((x) => ({ text: x.text, sources: [src(x, input.transcriptVersion)] }));
  },
  async chronology(input) {
    return demoChronology(input);
  },
  async questions(input) {
    return demoExtract(input).questions;
  },
};
