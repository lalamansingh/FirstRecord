"use server";
/** Public (no sign-in) actions: submit an online complaint and look up its status. */
import { z } from "zod";
import { requestIp } from "@/lib/auth/session";
import { rateLimit } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { getTr } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import {
  submitComplaint,
  trackComplaint,
  hashSubmitter,
  newTrackingCode,
  ONLINE_STATUS_LABELS,
  type PublicStatus,
} from "@/lib/domain/online-complaints";

export type SubmitState =
  | { ok: true; trackingCode?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

export type TrackState =
  | { ok: true; result?: (PublicStatus & { statusLabel: string; publicNoteText: string }) | null; searched?: boolean }
  | { ok: false; error: string };

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}

export async function submitComplaintAction(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const tr = await getTr();
  const t = (s: string) => tr(s as MsgKey);
  // Honeypot: real people never see or fill this field. Pretend success, store nothing.
  if (str(fd, "website")) return { ok: true, trackingCode: newTrackingCode() };

  const ip = await requestIp();
  const hash = hashSubmitter(ip) ?? "unknown";
  if (!rateLimit(`complaint-burst:${hash}`, 3, 60_000)) {
    return { ok: false, error: t("Too many complaints have been submitted from this connection. Please try again later.") };
  }
  const values: Record<string, string> = {};
  for (const k of ["complainantName", "phone", "email", "address", "stationId", "incidentType", "incidentDate", "incidentLocation", "description"]) {
    values[k] = str(fd, k).slice(0, 8000);
  }
  try {
    const { trackingCode } = submitComplaint(
      {
        complainantName: str(fd, "complainantName"),
        phone: str(fd, "phone"),
        email: str(fd, "email"),
        address: str(fd, "address"),
        stationId: str(fd, "stationId"),
        incidentType: str(fd, "incidentType"),
        incidentDate: str(fd, "incidentDate"),
        incidentLocation: str(fd, "incidentLocation"),
        description: str(fd, "description"),
        language: str(fd, "language") || "en",
        consent: fd.get("consent") === "on",
      },
      { ip },
    );
    return { ok: true, trackingCode };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = String(issue.path[0] ?? "_");
        if (!fieldErrors[key]) fieldErrors[key] = t(issue.message);
      }
      return { ok: false, error: t("Please correct the highlighted fields."), fieldErrors, values };
    }
    if (e instanceof AppError) {
      const fe = e.fieldErrors ? Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, t(v)])) : undefined;
      return { ok: false, error: t(e.message), fieldErrors: fe, values };
    }
    console.error("[complaint] unexpected error:", (e as Error)?.name, (e as Error)?.message);
    return { ok: false, error: t("Something went wrong. Your complaint was not saved. Please try again."), values };
  }
}

export async function trackComplaintAction(_prev: TrackState, fd: FormData): Promise<TrackState> {
  const tr = await getTr();
  const t = (s: string) => tr(s as MsgKey);
  const hash = hashSubmitter(await requestIp()) ?? "unknown";
  if (!rateLimit(`complaint-track:${hash}`, 20, 10 * 60_000)) {
    return { ok: false, error: t("Too many lookups. Please wait a few minutes and try again.") };
  }
  const code = str(fd, "trackingCode").slice(0, 40);
  const phone = str(fd, "phone").slice(0, 20);
  if (!code.trim() || !phone.trim()) return { ok: false, error: t("Enter the tracking code and the phone number you used.") };
  const r = trackComplaint(code, phone);
  if (!r) return { ok: true, result: null, searched: true };
  return { ok: true, searched: true, result: { ...r, statusLabel: t(ONLINE_STATUS_LABELS[r.status]), publicNoteText: t(r.publicNote) } };
}
