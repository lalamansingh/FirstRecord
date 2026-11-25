/**
 * Client/server-safe helpers for timestamp markers in transcripts.
 *
 * Supported markers (each starts a segment that runs until the next marker):
 *   [mm:ss]                 — start time only (manual "Insert timestamp")
 *   [mm:ss - mm:ss]         — start and end time (automatic transcription; editable)
 *   [h:mm:ss - h:mm:ss]     — hours allowed for long recordings
 */

export interface TranscriptSegment {
  start: number; // char offset in transcript text
  end: number;
  text: string;
  offsetMs: number; // segment start in recording
  endMs?: number; // segment end in recording, when known
  recordingId: string | null;
}

export function formatTimestamp(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

export function formatRange(startMs: number, endMs?: number | null) {
  return endMs != null && endMs > startMs ? `[${formatTimestamp(startMs)} - ${formatTimestamp(endMs)}]` : `[${formatTimestamp(startMs)}]`;
}

const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?`;
const MARKER = new RegExp(String.raw`\[${TIME}(?:\s*[-–]\s*${TIME})?\]`, "g");

function toMs(a: string, b: string, c: string | undefined) {
  return c !== undefined ? (Number(a) * 3600 + Number(b) * 60 + Number(c)) * 1000 : (Number(a) * 60 + Number(b)) * 1000;
}

/** Each marker starts a segment that runs until the next marker. */
export function parseSegments(text: string, recordingId: string | null): TranscriptSegment[] {
  const marks: { index: number; len: number; ms: number; endMs?: number }[] = [];
  let m: RegExpExecArray | null;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(text))) {
    const ms = toMs(m[1], m[2], m[3]);
    const endMs = m[4] !== undefined ? toMs(m[4], m[5], m[6]) : undefined;
    marks.push({ index: m.index, len: m[0].length, ms, endMs: endMs !== undefined && endMs >= ms ? endMs : undefined });
  }
  return marks.map((mk, i) => {
    const start = mk.index + mk.len;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const seg: TranscriptSegment = { start, end, text: text.slice(start, end).trim(), offsetMs: mk.ms, recordingId };
    if (mk.endMs !== undefined) seg.endMs = mk.endMs;
    return seg;
  });
}

/** Build editable transcript text from timed chunks (e.g. automatic speech recognition output). */
export function segmentsToText(chunks: { startMs: number; endMs: number | null; text: string }[]) {
  return chunks
    .map((c) => ({ ...c, text: c.text.trim() }))
    .filter((c) => c.text)
    .map((c) => `${formatRange(c.startMs, c.endMs)} ${c.text}`)
    .join("\n");
}
