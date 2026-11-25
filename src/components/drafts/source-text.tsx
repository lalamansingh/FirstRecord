/** Renders a transcript with source ranges highlighted and anchored (#src-<start>). */
import type { SourceRef } from "@/lib/ai/types";
import type { DiffPart } from "./diff";

export function mergedRanges(text: string, sources: SourceRef[], version: number) {
  const ranges = sources
    .filter((s): s is Extract<SourceRef, { kind: "transcript" }> => s.kind === "transcript" && s.transcriptVersion === version && s.end <= text.length && text.slice(s.start, s.end) === s.quote)
    .map((s) => ({ start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export function SourceText({ text, sources, version, lang }: { text: string; sources: SourceRef[]; version: number; lang: string }) {
  const merged = mergedRanges(text, sources, version);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach((r, i) => {
    if (r.start > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, r.start)}</span>);
    parts.push(
      <mark key={`m${i}`} id={`src-${r.start}`} className="scroll-mt-24 rounded-sm bg-amber-100 px-0.5 text-slate-900 target:bg-amber-300 target:ring-2 target:ring-amber-500">
        {text.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  });
  if (pos < text.length) parts.push(<span key="tail">{text.slice(pos)}</span>);
  return (
    <div lang={lang} className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
      {parts}
    </div>
  );
}

/** Anchor of the highlighted range containing a source, if it is shown. */
export function sourceAnchor(ranges: { start: number; end: number }[], s: SourceRef): string | undefined {
  if (s.kind !== "transcript") return undefined;
  const r = ranges.find((x) => s.start >= x.start && s.start < x.end);
  return r ? `#src-${r.start}` : undefined;
}

export function DiffView({ parts, lang }: { parts: DiffPart[]; lang?: string }) {
  return (
    <p lang={lang} className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "added" ? (
          <ins key={i} className="bg-emerald-100 text-emerald-900 no-underline">
            <span className="sr-only">[added: </span>
            {p.text}
            <span className="sr-only">]</span>
          </ins>
        ) : (
          <del key={i} className="bg-red-100 text-red-900">
            <span className="sr-only">[removed: </span>
            {p.text}
            <span className="sr-only">]</span>
          </del>
        ),
      )}
    </p>
  );
}
