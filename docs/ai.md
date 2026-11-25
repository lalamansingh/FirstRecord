# AI assistance: behaviour and limitations

FirstRecord's assistant helps staff **organize what a speaker said** into the fields of a draft. It is a drafting aid. It is not a decision-maker.

## What the assistant does

- It fills the template fields marked `fill: "ai"` (informant, date/time, place, neutral description, summary, chronology, verbatim extracts, persons described, property, witnesses, reason for delay) using only the transcript version it is given and the intake record.
- For every value it records **source references**: the exact quoted text in the transcript (with character offsets and the transcript version it came from), or the intake field the value came from.
- It marks anything not stated as **"Not provided"** and anything ambiguous or conflicting as **"Needs confirmation"**.
- It produces neutral **questions** that staff can ask the speaker about missing or unclear details.
- It **abstains** when the source is empty or too thin to support a draft, and says why.

## What the assistant never does

- It never files an FIR, submits a document, or marks anything as filed.
- It never approves a statement or marks a draft reviewed. Only a user with `draft.review` can do that, and only after an explicit confirmation.
- It never decides whether an offence occurred, classifies an offence legally, or picks legal provisions. The **Legal provisions** field is officer-only (`fill: "manual"`). The assistant leaves it empty with the note "No approved legal source configured". Suggesting provisions would need an approved, maintained legal source for the jurisdiction, and none is bundled.
- It never produces credibility, guilt, threat, risk or predictive scores. No such scoring exists anywhere in FirstRecord.
- It never invents or "cleans up" facts, names, dates, places or quotations.

## Safeguards built into the code

| Safeguard | Where |
|---|---|
| **Verbatim-quote verification.** Each quote returned by a provider is located in the transcript (an exact match first, then a whitespace-insensitive match). Quotes that cannot be found are dropped. A value left with no verifiable support is downgraded to "Needs confirmation". Stored sources can be re-checked with `verifySources()`. | `src/lib/ai/sources.ts`, `src/lib/ai/anthropic.ts` |
| **Draft labelling.** Every draft version stores its `origin` (`ai`, `demo` or `human`), provider, model, the transcript version it was based on, and a timestamp. The UI shows an "AI-generated draft" or "Demo-generated" label and the draft status ("Draft — not reviewed", "Clarification requested", "Reviewed by officer (not filed)"). | `draft_versions` table, review UI |
| **Human review required.** Reviewers accept, edit or reject each suggestion. Edits create new immutable versions. Marking a draft reviewed checks the template's required fields and asks for confirmation. | review workflow |
| **Separation of verbatim and generated text.** "Verbatim extracts" holds unaltered quotations. Summaries are labelled as generated. | template and draft fields |
| **Live use needs explicit authorization.** Statement text goes to an external model only when `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` is set **and** `AI_EXTERNAL_PROCESSING_AUTHORIZED=true`. Otherwise the rule-based assistant is used, and the UI explains why. | `src/lib/ai/index.ts` |
| **Metadata-only logging.** `ai_request_metadata` records the purpose, provider, model, mode, statement and draft IDs, character counts, status (success, abstained or error), latency and a truncated error message. It never records prompt or response content. | `generateDraftLogged()` |

## Demo mode and live mode

| | Rule-based assistant (default) | Live (Anthropic) |
|---|---|---|
| Network calls | None | Anthropic Messages API |
| Method | Fixed rules: splits sentences, picks out time and place cues, copies verbatim sentences | A model fills a structured output schema with quotes, which are then verified as above |
| Labels | "Demo-generated (deterministic, no AI model)" | Provider and model name shown on the draft |
| Quality | Rough. Meant to show the workflow, not to give good drafts | Better organization, still needs full human review |

## Data handling

- **No training on records.** FirstRecord does not train or fine-tune any model. Whether an external provider retains or trains on API data is set by that provider's terms and the deployment's agreement with them. The deploying organization must check this before setting `AI_EXTERNAL_PROCESSING_AUTHORIZED=true`.
- **Minimal content per call.** Only the transcript text and the intake fields needed for drafting are sent. Party contact details, recordings and attachments are not sent.
- **No content in logs.** Prompts and responses are not written to application logs or to the audit log.

## Automatic transcription (speech-to-text)

- When a statement is recorded on audio or video, the transcript step automatically transcribes the saved recording with OpenAI's Whisper model running **in the browser** (transformers.js + ONNX Runtime Web, in a Web Worker; WebGPU when available, otherwise WebAssembly).
- The recording is decoded locally and is **never uploaded to a transcription service**. Only the model weights are downloaded (first use; cached by the browser).
- Output is a list of timestamped segments written as editable lines: `[00:00 - 00:10] text`. Staff can edit words and times; the segment list lets them jump the player to each segment.
- On save, the unedited machine output is stored as an `automatic_transcription` transcript version (labelled with the model and an uncertainty note), and the staff-reviewed text is stored as a separate version on top. Both stay inspectable; the transcript must still be confirmed with the speaker.
- Models: "Standard" (whisper-base) or "High accuracy" (whisper-small, default for Hindi). Machine transcription can mis-hear names, numbers and places and can occasionally invent words in silence — every segment must be checked against the recording.
- Offline deployments: set `NEXT_PUBLIC_WHISPER_LOCAL_MODELS=true` and place model files under `public/models/<model-id>/`.

## Known limitations

- Automatic speech-to-text is **not** bundled. Transcripts are typed, entered with staff help, or transcribed by hand from the recording (with optional timestamps).
- The rule-based assistant is rule-based and will often mark fields "Needs confirmation". That is expected.
- Translation is not automatic. A Hindi statement stays in Hindi, and drafting does not translate it.
- Model output can still be wrong even when it is supported by verified quotes: a quote might be correct while the summary built from it misleads. Reviewers must compare every field with its source, and the side-by-side review screen exists for that.
