/**
 * Provider selection + metadata logging. Live AI is used only when explicitly
 * configured AND external processing of personal data is authorized; otherwise
 * the deterministic demo assistant is used and its output is labelled as such.
 */
import { config } from "@/lib/config";
import { insert, newId, now } from "@/lib/db";
import { demoProvider } from "./demo";
import { createAnthropicProvider } from "./anthropic";
import type { AIProvider, DraftInput, DraftOutput } from "./types";

export * from "./types";

let cached: AIProvider | null = null;
let cachedKey = "";

export function getAIProvider(): AIProvider {
  const live = config.aiProvider === "anthropic" && !!config.anthropicApiKey && config.aiExternalAuthorized;
  const key = live ? `anthropic:${config.aiModel}` : "demo";
  if (cached && cachedKey === key) return cached;
  cached = live ? createAnthropicProvider({ apiKey: config.anthropicApiKey, model: config.aiModel }) : demoProvider;
  cachedKey = key;
  return cached;
}

/** Why live AI is not active (for UI). */
export function aiStatusNote(): string | null {
  if (config.aiProvider !== "anthropic") return "No AI provider is configured. The rule-based assistant copies verbatim sentences using fixed rules.";
  if (!config.anthropicApiKey) return "AI provider selected but no API key is configured — using the rule-based assistant.";
  if (!config.aiExternalAuthorized) return "External processing of statement data is not authorized for this deployment — using the rule-based assistant.";
  return null;
}

/** Run a draft generation and log metadata (never content). */
export async function generateDraftLogged(
  input: DraftInput,
  ctx: { userId: string; statementId: string; draftId?: string | null },
): Promise<{ output: DraftOutput; provider: AIProvider["info"] }> {
  const provider = getAIProvider();
  const started = Date.now();
  try {
    const output = await provider.generateDraft(input);
    insert("ai_request_metadata", {
      id: newId(),
      user_id: ctx.userId,
      purpose: "draft_generation",
      provider: provider.info.name,
      model: provider.info.model,
      mode: provider.info.mode,
      statement_id: ctx.statementId,
      draft_id: ctx.draftId ?? null,
      input_chars: input.transcript.length,
      output_chars: JSON.stringify(output.fields).length,
      status: output.abstained ? "abstained" : "success",
      latency_ms: Date.now() - started,
      created_at: now(),
    });
    return { output, provider: provider.info };
  } catch (e) {
    insert("ai_request_metadata", {
      id: newId(),
      user_id: ctx.userId,
      purpose: "draft_generation",
      provider: provider.info.name,
      model: provider.info.model,
      mode: provider.info.mode,
      statement_id: ctx.statementId,
      draft_id: ctx.draftId ?? null,
      input_chars: input.transcript.length,
      output_chars: 0,
      status: "error",
      error: ((e as Error).message || "error").slice(0, 200),
      latency_ms: Date.now() - started,
      created_at: now(),
    });
    throw e;
  }
}

/** Missing-detail questions for the transcript step (demo provider is local; live calls are logged). */
export async function missingDetailQuestions(input: DraftInput, ctx: { userId: string; statementId: string }) {
  const provider = getAIProvider();
  if (provider.info.mode === "demo") return { questions: await provider.questions(input), provider: provider.info };
  const { output } = await generateDraftLogged(input, ctx);
  return { questions: output.questions, provider: provider.info };
}
