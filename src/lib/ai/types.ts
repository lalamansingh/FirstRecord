/**
 * AI assistance contracts. The assistant only organizes what the speaker said:
 * it never files, approves, classifies offences, or scores anyone.
 */
import type { TemplateField } from "@/lib/seed/base";

export type FieldStatus = "provided" | "not_provided" | "needs_confirmation";
export type FieldOrigin = "ai" | "demo" | "human";

export type SourceRef =
  | { kind: "transcript"; quote: string; start: number; end: number; transcriptVersion: number }
  | { kind: "intake"; field: string; label: string };

export interface DraftField {
  value: string | string[];
  status: FieldStatus;
  sources: SourceRef[];
  origin: FieldOrigin;
  /** Reviewer decision on an AI/demo suggestion. */
  decision?: "accepted" | "rejected" | "edited" | null;
  /** Reviewer explicitly confirmed a field still marked "Needs confirmation". */
  confirmedByReviewer?: boolean;
  /** Short explanation, e.g. which cues produced the suggestion. */
  rationale?: string;
}

export type DraftFields = Record<string, DraftField>;

export interface DraftQuestion {
  field?: string;
  question: string;
}

export interface SourcedItem {
  text: string;
  sources: SourceRef[];
}

export interface DraftInput {
  transcript: string;
  transcriptVersion: number;
  language: string;
  template: TemplateField[];
  intake: {
    speakerName: string | null;
    incidentType: string | null;
    incidentDate: string | null;
    incidentLocation: string | null;
  };
}

export interface DraftOutput {
  fields: DraftFields;
  questions: DraftQuestion[];
  /** True when the source was insufficient and the assistant declined to fill fields. */
  abstained: boolean;
  abstainReason?: string;
}

export interface ProviderInfo {
  name: string; // "demo" | "anthropic"
  model: string;
  mode: "demo" | "live";
  label: string; // e.g. "Rule-based assistant (deterministic, no external calls)"
}

export interface AIProvider {
  info: ProviderInfo;
  generateDraft(input: DraftInput): Promise<DraftOutput>;
  summarize(input: DraftInput): Promise<SourcedItem[]>;
  chronology(input: DraftInput): Promise<SourcedItem[]>;
  questions(input: DraftInput): Promise<DraftQuestion[]>;
}

export const NOT_PROVIDED = "Not provided";
export const NEEDS_CONFIRMATION = "Needs confirmation";
