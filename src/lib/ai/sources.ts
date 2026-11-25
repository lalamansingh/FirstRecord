/** Source-quote verification: every generated fact must point at verbatim transcript text. */
import type { SourceRef } from "./types";

/** Find a quote verbatim in the transcript (exact, then whitespace-insensitive). */
export function locateQuote(transcript: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim();
  if (q.length < 2) return null;
  const i = transcript.indexOf(q);
  if (i >= 0) return { start: i, end: i + q.length };
  // Whitespace-insensitive match: build a regex from the quote's words.
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return null;
  const m = new RegExp(words.join("\\s+")).exec(transcript);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export function transcriptSource(transcript: string, quote: string, version: number): SourceRef | null {
  const loc = locateQuote(transcript, quote);
  if (!loc) return null;
  return { kind: "transcript", quote: transcript.slice(loc.start, loc.end), start: loc.start, end: loc.end, transcriptVersion: version };
}

/** Re-validate stored sources against a transcript; returns only those still verbatim-present. */
export function verifySources(transcript: string, sources: SourceRef[], version: number): SourceRef[] {
  const out: SourceRef[] = [];
  for (const s of sources) {
    if (s.kind === "intake") {
      out.push(s);
      continue;
    }
    const v = transcriptSource(transcript, s.quote, version);
    if (v) out.push(v);
  }
  return out;
}

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

/** Split into sentences with offsets (English and Devanagari danda). */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?।\n]+[.!?।]*["”’']?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t.length < 2) continue;
    out.push({ text: t, start: m.index + lead, end: m.index + lead + t.length });
  }
  return out;
}
