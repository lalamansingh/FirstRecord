"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import {
  abandonStatement,
  addTranscriptVersion,
  confirmTranscript,
  createStatement,
  recordConsent,
  setCaptureMethod,
  updateIntake,
  type IntakeInput,
} from "@/lib/domain/statements";
import { generateDraft } from "@/lib/domain/drafts";
import { createCaseFromStatement } from "@/lib/domain/case-create";

const intakeSchema = z.object({
  intakeAt: z.string().min(1, "Intake date and time is required").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  incidentType: zs.optional(80),
  incidentDate: zs.optional(40),
  incidentLocation: zs.optional(300),
  language: z.string().min(1, "Choose a language"),
  speakerName: zs.optional(150),
  speakerContact: zs.optional(150),
  speakerAddress: zs.optional(300),
  speakerRole: z.enum(["complainant", "witness", "involved", "other"]),
});

function intakeFrom(fd: FormData): IntakeInput {
  return intakeSchema.parse(Object.fromEntries(fd.entries()));
}

function sid(fd: FormData) {
  return z.string().uuid("Invalid report").parse(fd.get("statementId"));
}

export async function createIntakeAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.create");
    const id = createStatement(user, intakeFrom(fd));
    revalidatePath("/intake");
    return { ok: true, message: "Intake saved. You can resume this report at any time.", redirectTo: `/intake/${id}?step=method` };
  });
}

export async function updateIntakeAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.edit");
    const id = sid(fd);
    updateIntake(user, id, intakeFrom(fd));
    revalidatePath(`/intake/${id}`);
    return { ok: true, message: "Intake details saved.", redirectTo: `/intake/${id}?step=method` };
  });
}

const methodSchema = z.object({
  method: z.enum(["typed", "audio", "video", "assisted", "accessible"], { message: "Choose how the statement will be captured" }),
  accessibilityNotes: zs.optional(1000),
  interpreterName: zs.optional(150),
});

export async function setMethodAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.edit");
    const id = sid(fd);
    const m = methodSchema.parse(Object.fromEntries(fd.entries()));
    setCaptureMethod(user, id, m.method, { accessibilityNotes: m.accessibilityNotes, interpreterName: m.interpreterName });
    revalidatePath(`/intake/${id}`);
    const next = m.method === "audio" || m.method === "video" ? "consent" : "capture";
    return { ok: true, message: "Capture method saved.", redirectTo: `/intake/${id}?step=${next}` };
  });
}

const consentSchema = z.object({
  scope: z.enum(["audio", "video"]),
  decision: z.enum(["granted", "declined"]),
  noticeLanguage: z.string().min(2).max(5),
  acknowledged: z.string().optional(),
});

export async function consentAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.edit");
    const id = sid(fd);
    const c = consentSchema.parse(Object.fromEntries(fd.entries()));
    if (c.decision === "granted" && c.acknowledged !== "on") {
      return { ok: false, error: "Confirm that the notice was read to or by the person before recording consent.", fieldErrors: { acknowledged: "Required before recording consent" } };
    }
    recordConsent(user, id, c.scope, c.decision, c.noticeLanguage);
    revalidatePath(`/intake/${id}`);
    return {
      ok: true,
      message: c.decision === "granted" ? "Consent recorded. You may start recording." : "Recording declined. Continue with staff-assisted entry — the report is still accepted.",
      redirectTo: `/intake/${id}?step=capture`,
    };
  });
}

/** Called directly from the recorder when the speaker withdraws consent mid-recording. */
export async function withdrawConsentAction(statementId: string, scope: "audio" | "video", noticeLanguage: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.edit");
    const id = z.string().uuid().parse(statementId);
    recordConsent(user, id, z.enum(["audio", "video"]).parse(scope), "withdrawn", noticeLanguage);
    revalidatePath(`/intake/${id}`);
    return { ok: true, message: "Consent withdrawal recorded. Recording stopped." };
  });
}

const transcriptSchema = z.object({
  text: z.string().max(100_000, "Too long"),
  source: z.enum(["typed_original", "manual_transcription", "assisted_entry", "correction"]),
  note: zs.optional(500),
  uncertaintyNote: zs.optional(1000),
  recordingId: zs.optionalId(),
  next: z.string().optional(),
  // Raw output of on-device automatic transcription, if it was used.
  autoText: z.string().max(100_000, "Too long").optional(),
  autoModel: zs.optional(120),
});

export async function saveTranscriptAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.edit");
    const id = sid(fd);
    const { autoText, autoModel, ...t } = transcriptSchema.parse(Object.fromEntries(fd.entries()));
    let version: number;
    if (autoText && autoText.trim() && t.source === "manual_transcription" && t.recordingId) {
      // Keep the unedited machine output as its own version, then the staff-reviewed text on top.
      const machine = addTranscriptVersion(user, id, {
        text: autoText,
        source: "automatic_transcription",
        recordingId: t.recordingId,
        note: `Automatic transcription, on-device: ${autoModel ?? "Whisper"}. Unreviewed machine output.`,
        uncertaintyNote: "Machine-generated; may contain recognition errors. Must be checked against the recording.",
      });
      const edited = t.text.replace(/\r\n/g, "\n").trim() !== autoText.replace(/\r\n/g, "\n").trim();
      version = edited
        ? addTranscriptVersion(user, id, { ...t, note: t.note ?? "Reviewed and edited by staff from the automatic transcription." })
        : machine;
      revalidatePath(`/intake/${id}`);
      revalidatePath(`/statements/${id}`);
      return {
        ok: true,
        message: edited
          ? `Saved automatic transcript (version ${machine}) and your edited version ${version}.`
          : `Saved automatic transcript as version ${machine}. Confirm it with the speaker in the next step.`,
        redirectTo: t.next === "transcript" ? `/intake/${id}?step=transcript` : undefined,
      };
    }
    version = addTranscriptVersion(user, id, t);
    revalidatePath(`/intake/${id}`);
    revalidatePath(`/statements/${id}`);
    return {
      ok: true,
      message: `Saved as transcript version ${version}. Earlier versions are kept.`,
      redirectTo: t.next === "transcript" ? `/intake/${id}?step=transcript` : undefined,
    };
  });
}

export async function confirmTranscriptAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.edit");
    const id = sid(fd);
    if (fd.get("readBack") !== "on") {
      return { ok: false, error: "Confirm that the transcript was read back to or by the speaker.", fieldErrors: { readBack: "Required" } };
    }
    confirmTranscript(user, id);
    revalidatePath(`/intake/${id}`);
    return { ok: true, message: "Transcript confirmed.", redirectTo: `/intake/${id}?step=draft` };
  });
}

export async function generateDraftAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.generate");
    const id = sid(fd);
    const { draftId, version } = await generateDraft(user, id);
    revalidatePath(`/intake/${id}`);
    revalidatePath(`/statements/${id}`);
    const back = fd.get("returnTo") === "review" ? `/statements/${id}/review?draft=${draftId}` : `/intake/${id}?step=draft`;
    return { ok: true, message: `Draft version ${version} prepared. It must be reviewed by an authorized officer.`, redirectTo: back };
  });
}

const caseSchema = z.object({
  title: zs.required("Case title", 200),
  priority: zs.priority(),
  assignedTo: zs.optionalId(),
  incidentType: zs.required("Incident type", 80),
  summary: zs.text(4000).optional(),
});

export async function createCaseAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.create");
    const id = sid(fd);
    const input = caseSchema.parse(Object.fromEntries(fd.entries()));
    const dups = fd.getAll("duplicate").map(String).filter((x) => z.string().uuid().safeParse(x).success);
    const { reference } = createCaseFromStatement(user, id, { ...input, linkDuplicateIds: dups });
    revalidatePath(`/intake/${id}`);
    revalidatePath("/intake");
    revalidatePath("/cases");
    return { ok: true, message: `Case ${reference} created (local record only).`, redirectTo: `/intake/${id}?step=complete` };
  });
}

export async function abandonAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("statement.edit");
    const id = sid(fd);
    const reason = zs.required("Reason", 500).parse(fd.get("reason") ?? "");
    abandonStatement(user, id, reason);
    revalidatePath("/intake");
    return { ok: true, message: "Report intake abandoned. The record and audit history are kept.", redirectTo: "/intake" };
  });
}
