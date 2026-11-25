import { describe, it, expect } from "vitest";
import { parseSegments, segmentsToText, formatRange } from "@/components/intake/timestamps";

describe("transcript timestamp markers", () => {
  it("parses start-only markers (manual transcription)", () => {
    const segs = parseSegments("[00:00] Hello there. [00:12] Second part.", "r1");
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ offsetMs: 0, text: "Hello there.", recordingId: "r1" });
    expect(segs[0].endMs).toBeUndefined();
    expect(segs[1].offsetMs).toBe(12_000);
  });

  it("parses start-end range markers (automatic transcription) including hours and en dash", () => {
    const segs = parseSegments("[00:00 - 00:10] One.\n[00:10 – 00:15] Two.\n[1:02:03 - 1:02:09] Three.", null);
    expect(segs.map((s) => [s.offsetMs, s.endMs, s.text])).toEqual([
      [0, 10_000, "One."],
      [10_000, 15_000, "Two."],
      [3_723_000, 3_729_000, "Three."],
    ]);
  });

  it("ignores an end time earlier than the start", () => {
    const [s] = parseSegments("[00:20 - 00:05] Bad range.", null);
    expect(s.offsetMs).toBe(20_000);
    expect(s.endMs).toBeUndefined();
  });

  it("round-trips machine chunks to editable text and back", () => {
    const text = segmentsToText([
      { startMs: 0, endMs: 10_400, text: " I parked my scooter outside. " },
      { startMs: 10_400, endMs: 15_000, text: "In the morning it was gone." },
      { startMs: 15_000, endMs: null, text: "   " },
    ]);
    expect(text).toBe("[00:00 - 00:10] I parked my scooter outside.\n[00:10 - 00:15] In the morning it was gone.");
    const segs = parseSegments(text, "rec");
    expect(segs).toHaveLength(2);
    expect(segs[1]).toMatchObject({ offsetMs: 10_000, endMs: 15_000, text: "In the morning it was gone." });
  });

  it("formats ranges and single times", () => {
    expect(formatRange(5_000, 9_000)).toBe("[00:05 - 00:09]");
    expect(formatRange(5_000, null)).toBe("[00:05]");
  });
});
