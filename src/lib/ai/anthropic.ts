/**
 * Live provider using the Anthropic Messages API (official SDK, structured output).
 * Only constructed when AI_PROVIDER=anthropic, an API key is set AND
 * AI_EXTERNAL_PROCESSING_AUTHORIZED=true (statement text leaves the deployment).
 *
 * Safeguard: every value the model returns must cite quotes that exist verbatim
 * in the transcript. Values whose quotes cannot be found are discarded and the
 * field is marked "Needs confirmation".
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AIProvider, DraftFields, DraftInput, DraftOutput, DraftQuestion, SourceRef, SourcedItem } from "./types";
import { NEEDS_CONFIRMATION, NOT_PROVIDED } from "./types";
import { transcriptSource } from "./sources";
import { AppError } from "@/lib/errors";

const ResultSchema = z.object({
  abstain: z.boolean(),
  abstain_reason: z.string(),
  fields: z.array(
    z.object({
      key: z.string(),
      values: z.array(z.string()),
      status: z.enum(["provided", "not_provided", "needs_confirmation"]),
      quotes: z.array(z.string()),
    }),
  ),
  questions: z.array(z.object({ field: z.string(), question: z.string() })),
});
type Result = z.infer<typeof ResultSchema>;

const SYSTEM = `You help police-station staff organize a person's recorded statement into a DRAFT document for human review.

Rules you must follow:
- Use ONLY information stated in the supplied transcript or intake record. Never invent, infer or embellish names, dates, times, places, events, amounts or quotations.
- For every value you fill, list in "quotes" the exact substrings of the transcript that support it, copied character-for-character. Values without verbatim support will be discarded.
- Preserve the speaker's wording. Do not "clean up" or change meaning. Direct quotations must be unaltered.
- If something is not stated, set status "not_provided" and values []. If it is ambiguous or conflicting, set status "needs_confirmation" and add a neutral question for staff to ask.
- Do not classify offences, suggest legal sections, assess credibility, guilt, threat or risk, or recommend any action against anyone.
- "account_summary" must be a neutral summary of only what was said.
- If the transcript is too short or unclear to support a draft, set abstain true and explain why.`;

function buildPrompt(input: DraftInput) {
  const fields = input.template
    .filter((f) => f.fill === "ai")
    .map((f) => `- ${f.key} (${f.kind}${f.required ? ", required" : ""}): ${f.label}. ${f.help}`)
    .join("\n");
  return `Template fields to fill:\n${fields}\n\nIntake record (entered by staff):\n- speaker name: ${input.intake.speakerName ?? "not recorded"}\n- incident type selected at intake: ${input.intake.incidentType ?? "not recorded"}\n- incident date entered at intake: ${input.intake.incidentDate ?? "not recorded"}\n- location entered at intake: ${input.intake.incidentLocation ?? "not recorded"}\n\nStatement language: ${input.language}\n\n<transcript>\n${input.transcript}\n</transcript>`;
}

export function createAnthropicProvider(opts: { apiKey: string; model: string }): AIProvider {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 120_000 });

  async function call(input: DraftInput): Promise<Result | { refused: true }> {
    try {
      const res = await client.messages.parse({
        model: opts.model,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: "user", content: buildPrompt(input) }],
        output_config: { format: zodOutputFormat(ResultSchema) },
      });
      if (res.stop_reason === "refusal") return { refused: true };
      if (!res.parsed_output) throw new AppError("The AI provider returned an unreadable response. No draft was created.", 502);
      return res.parsed_output;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof Anthropic.RateLimitError) throw new AppError("The AI provider is rate-limiting requests. Try again shortly, or prepare the draft manually.", 503);
      if (e instanceof Anthropic.AuthenticationError) throw new AppError("The AI provider rejected the configured credentials. Contact your system administrator.", 502);
      if (e instanceof Anthropic.APIError) throw new AppError(`The AI provider returned an error (${e.status ?? "network"}). No draft was created.`, 502);
      throw new AppError("Could not reach the AI provider. No draft was created.", 502);
    }
  }

  function verify(input: DraftInput, r: Result): DraftOutput {
    const fields: DraftFields = {};
    const questions: DraftQuestion[] = r.questions.map((q) => ({ field: q.field || undefined, question: q.question }));
    const byKey = new Map(r.fields.map((f) => [f.key, f]));
    for (const tf of input.template) {
      if (tf.fill === "manual") {
        fields[tf.key] = { value: "", status: "not_provided", sources: [], origin: "human", decision: null, rationale: tf.key === "legal_provisions" ? "No approved legal source configured — to be completed by an authorized officer." : "Officer-only field." };
        continue;
      }
      const f = byKey.get(tf.key);
      if (!f || f.status === "not_provided" || f.values.length === 0) {
        fields[tf.key] = { value: NOT_PROVIDED, status: "not_provided", sources: [], origin: "ai", decision: null, rationale: "Not stated in the account." };
        continue;
      }
      const sources: SourceRef[] = [];
      let dropped = 0;
      for (const q of f.quotes) {
        const s = transcriptSource(input.transcript, q, input.transcriptVersion);
        if (s) sources.push(s);
        else dropped++;
      }
      // Intake-derived values (e.g. informant name) may be supported by the intake record.
      const intakeSupport: SourceRef[] = [];
      if (tf.key === "informant" && input.intake.speakerName) intakeSupport.push({ kind: "intake", field: "speaker_name", label: "Speaker name recorded at intake" });
      if (sources.length === 0 && intakeSupport.length === 0) {
        fields[tf.key] = { value: NEEDS_CONFIRMATION, status: "needs_confirmation", sources: [], origin: "ai", decision: null, rationale: "The AI suggestion was discarded because its supporting quotes were not found verbatim in the transcript." };
        questions.push({ field: tf.key, question: `${tf.label}: the assistant could not ground a value in the statement. Confirm with the speaker.` });
        continue;
      }
      const value = tf.kind === "list" ? f.values : f.values.join(" ");
      fields[tf.key] = {
        value,
        status: f.status === "provided" && dropped === 0 ? "provided" : "needs_confirmation",
        sources: [...sources, ...intakeSupport],
        origin: "ai",
        decision: null,
        rationale: dropped ? `${dropped} supporting quote(s) could not be verified and were removed; please check this value.` : "Each value is linked to verbatim transcript text.",
      };
    }
    return { fields, questions, abstained: false };
  }

  const info = { name: "anthropic", model: opts.model, mode: "live" as const, label: `Anthropic ${opts.model} (external processing authorized)` };

  return {
    info,
    async generateDraft(input) {
      const r = await call(input);
      if ("refused" in r || r.abstain) {
        const reason = "refused" in r ? "The AI provider declined this request." : r.abstain_reason || "The statement does not contain enough information.";
        const fields: DraftFields = {};
        for (const tf of input.template) fields[tf.key] = { value: NOT_PROVIDED, status: "not_provided", sources: [], origin: tf.fill === "manual" ? "human" : "ai", decision: null, rationale: "Assistant abstained." };
        return { fields, questions: [{ question: `Assistant abstained: ${reason} Prepare the draft manually.` }], abstained: true, abstainReason: reason };
      }
      return verify(input, r);
    },
    async summarize(input): Promise<SourcedItem[]> {
      const out = await this.generateDraft(input);
      const f = out.fields.account_summary;
      return f && f.status !== "not_provided" ? [{ text: String(f.value), sources: f.sources }] : [];
    },
    async chronology(input): Promise<SourcedItem[]> {
      const out = await this.generateDraft(input);
      const f = out.fields.chronology;
      if (!f || !Array.isArray(f.value)) return [];
      return f.value.map((text) => ({ text, sources: f.sources }));
    },
    async questions(input) {
      return (await this.generateDraft(input)).questions;
    },
  };
}
