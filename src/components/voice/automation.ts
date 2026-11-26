"use client";
/**
 * UI automation for the voice assistant: turns VoiceActions into real DOM work
 * (navigate, type into fields, press submit, open a case). Forms are the app's
 * normal server-action forms, so validation, confirmation and RBAC still apply.
 *
 * Fill rules:
 *  - a fill targets exactly its mapped field, resolved by `name` inside the owning
 *    form (never "the first input" or the focused element);
 *  - if the field is not on the current page it waits ≤6 s and then fails with
 *    "field-missing" — it never types anywhere else and never navigates by itself;
 *  - re-filling replaces the value (clear, then type); other fields are untouched;
 *  - typing is aborted immediately when the page changes.
 */
import type { VoiceAction, VoiceField, VoiceTarget } from "./types";
import { paletteSearchCases } from "@/components/interactive/palette-actions";

type Result = { ok: boolean; detail?: string };

interface Deps {
  push: (href: string) => void;
  flyTo: (rect: DOMRect | null, target: VoiceTarget) => Promise<void>;
}

type FormKey = "report" | "statement" | "sos";

/** VoiceField → owning form + field name. */
const FIELD_MAP: Record<VoiceField, { form: FormKey; name: string }> = {
  "report.speakerName": { form: "report", name: "speakerName" },
  "report.speakerContact": { form: "report", name: "speakerContact" },
  "report.speakerAddress": { form: "report", name: "speakerAddress" },
  "report.incidentType": { form: "report", name: "incidentType" },
  "report.incidentDate": { form: "report", name: "incidentDate" },
  "report.incidentLocation": { form: "report", name: "incidentLocation" },
  "report.statement": { form: "statement", name: "text" },
  "sos.title": { form: "sos", name: "title" },
  "sos.message": { form: "sos", name: "message" },
  "sos.locationText": { form: "sos", name: "locationText" },
};

/** A form is identified by a field only it has. */
const FORM_ANCHOR: Record<FormKey, string> = {
  report: 'input[name="speakerName"]',
  statement: 'textarea[name="text"]',
  sos: 'textarea[name="message"]',
};

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve the exact field element for a VoiceField on the current page (or null). */
export function resolveField(field: VoiceField): Field | null {
  const map = FIELD_MAP[field];
  if (!map) return null;
  const anchor = document.querySelector(FORM_ANCHOR[map.form]);
  const form = anchor?.closest("form");
  if (!form) return null;
  const el = form.querySelector(`[name="${map.name}"]`);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el : null;
}

/** Wait (MutationObserver) until `resolve()` returns an element, up to `timeout` ms. */
function waitForEl<T>(resolve: () => T | null, timeout = 6000): Promise<T | null> {
  const now = resolve();
  if (now) return Promise.resolve(now);
  return new Promise((done) => {
    const obs = new MutationObserver(() => {
      const el = resolve();
      if (el) {
        obs.disconnect();
        clearTimeout(timer);
        done(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      obs.disconnect();
      done(resolve());
    }, timeout);
  });
}

/** Wait until `selector` is in the DOM (MutationObserver), up to `timeout` ms. */
export function waitFor(selector: string, timeout = 6000): Promise<Element | null> {
  return waitForEl(() => document.querySelector(selector), timeout);
}

/** Set a value React will notice on (un)controlled inputs, selects and textareas. */
function setNativeValue(el: Field, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function fireChange(el: Field) {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function normaliseDate(el: HTMLInputElement, value: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (el.type === "date" && iso) return iso;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (el.type === "datetime-local") return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return date;
}

function onPage(prefix: string) {
  const p = window.location.pathname;
  return prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix || p.startsWith(prefix + "/");
}


/* ---------------------------------------------------------------------------
 * Intake wizard (/intake/[id]) helpers
 * ------------------------------------------------------------------------- */
export const INTAKE_STEPS = ["intake", "method", "consent", "capture", "transcript", "draft", "review", "case", "complete"] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

function intakeId(): string | null {
  const m = /^\/intake\/([^/?#]+)/.exec(window.location.pathname);
  return m && m[1] !== "new" ? m[1] : null;
}

/** Current intake step: ?step= query, else the stepper's active item, else null. */
export function readIntakeStep(): IntakeStep | null {
  if (typeof window === "undefined") return null;
  if (window.location.pathname === "/intake/new") return "intake";
  if (!intakeId()) return null;
  const q = new URLSearchParams(window.location.search).get("step");
  if (q && (INTAKE_STEPS as readonly string[]).includes(q)) return q as IntakeStep;
  // Fallback: the active stepper item has no link; infer it from its neighbours' links.
  const items = Array.from(document.querySelectorAll('nav[aria-label] ol > li'));
  const idx = items.findIndex((li) => li.querySelector('[aria-current="step"]'));
  if (idx < 0) return null;
  const stepOf = (li: Element | undefined) => {
    const href = li?.querySelector("a")?.getAttribute("href") ?? "";
    const st = new URL(href, window.location.origin).searchParams.get("step");
    return st && (INTAKE_STEPS as readonly string[]).includes(st) ? (st as IntakeStep) : null;
  };
  const prev = stepOf(items[idx - 1]);
  const next = stepOf(items[idx + 1]);
  const from = prev ? INTAKE_STEPS.indexOf(prev) + 1 : 0;
  const to = next ? INTAKE_STEPS.indexOf(next) : INTAKE_STEPS.length;
  return INTAKE_STEPS.slice(from, to)[0] ?? null;
}

/** Step string for the dialog: like readIntakeStep(), plus "capture:saved" once the statement is saved. */
export function readIntakeStepForDialog(): string | null {
  const st = readIntakeStep();
  if (st === "capture" && forwardLink("capture")) return "capture:saved";
  return st;
}

/** The page's own forward link ("Continue …") to a later step — never a stepper link. */
function forwardLink(current: IntakeStep | null): HTMLAnchorElement | null {
  const id = intakeId();
  if (!id) return null;
  const cur = current ? INTAKE_STEPS.indexOf(current) : -1;
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(`main a[href^="/intake/${id}?step="]`)).filter(
    (a) => !a.closest("nav") && !a.closest("details"),
  );
  let best: HTMLAnchorElement | null = null;
  let bestIdx = Infinity;
  for (const a of links) {
    const st = new URL(a.getAttribute("href") ?? "", window.location.origin).searchParams.get("step") as IntakeStep | null;
    const i = st ? INTAKE_STEPS.indexOf(st) : -1;
    // nearest later step, and only button-styled links (skip inline "go back" text links)
    if (i > cur && i < bestIdx && (a.className.includes("rounded-full") || a.className.includes("inline-flex"))) {
      best = a;
      bestIdx = i;
    }
  }
  return best;
}

/** The step's primary form (not the "abandon" form, not secondary "Regenerate"). */
function primaryStepForm(): { form: HTMLFormElement; button: HTMLButtonElement } | null {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>("main form")).filter(
    (f) => !f.closest("details") && !f.closest("nav") && !f.closest("[data-fr-mascot]"),
  );
  // priority: read-back confirmation, capture method, statement text, then the first form with a primary submit
  const pick =
    forms.find((f) => f.querySelector('input[name="readBack"]')) ??
    forms.find((f) => f.querySelector('input[name="method"]')) ??
    forms.find((f) => {
      const t = f.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
      return !!t && t.value.trim().length > 0;
    }) ??
    forms.find((f) => {
      const b = f.querySelector<HTMLButtonElement>('button[type="submit"]');
      return !!b && !b.disabled && !/border-\[#e6e4de\]/i.test(b.className);
    }) ??
    null;
  if (!pick) return null;
  const button = pick.querySelector<HTMLButtonElement>('button[type="submit"]');
  return button ? { form: pick, button } : null;
}

export function createAutomation(deps: Deps) {
  /** Bumped on every navigation / abort; running typing loops stop when it changes. */
  let generation = 0;
  /** Statement dictated before the capture step exists; typed when that step appears. */
  let pendingStatement: string | null = null;

  function abort() {
    generation += 1;
  }

  /** Clear, then type `value` char by char; stops at once if the page changes. */
  async function replaceTyping(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<boolean> {
    const gen = generation;
    const path = window.location.pathname;
    const alive = () => gen === generation && el.isConnected && window.location.pathname === path;
    el.focus({ preventScroll: true });
    try {
      el.select?.();
    } catch {
      /* some input types don't support select() */
    }
    setNativeValue(el, "");
    if (reducedMotion() || value.length > 400) {
      if (!alive()) return false;
      setNativeValue(el, value);
    } else {
      let acc = "";
      for (const ch of Array.from(value)) {
        if (!alive()) return false;
        acc += ch;
        setNativeValue(el, acc);
        await sleep(25);
      }
      if (!alive()) return false;
      if (el.value !== value) setNativeValue(el, value); // exact final value
    }
    fireChange(el);
    el.blur(); // let React validation run
    return true;
  }

  async function navigate(href: string): Promise<Result> {
    abort(); // cancel any typing on the current page
    const link = document.querySelector<HTMLAnchorElement>(`aside a[href="${href}"], nav a[href="${href}"]`);
    await deps.flyTo(link ? link.getBoundingClientRect() : null, { kind: "nav", href });
    deps.push(href);
    const start = Date.now();
    while (Date.now() - start < 6000) {
      if (onPage(href)) break;
      await sleep(80);
    }
    return { ok: onPage(href), detail: onPage(href) ? undefined : "navigation-timeout" };
  }

  async function fill(field: VoiceField, value: string): Promise<Result> {
    const map = FIELD_MAP[field];
    if (!map) return { ok: false, detail: "unknown-field" };
    const gen = generation;

    if (field === "report.statement" && !resolveField(field)) {
      const st = readIntakeStep();
      if (onPage("/intake/new") || (st && st !== "capture")) {
        // The statement box appears later (after the method step). Keep it and type it then.
        pendingStatement = value;
        return { ok: true, detail: "deferred" };
      }
    }
    const el: Field | null =
      field === "report.statement" ? await waitForEl(() => resolveField(field), 8000) : await waitForEl(() => resolveField(field), 6000);
    if (gen !== generation) return { ok: false, detail: "aborted" };
    if (!el) return { ok: false, detail: "field-missing" };

    el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    await sleep(reducedMotion() ? 0 : 280);
    if (gen !== generation || !el.isConnected) return { ok: false, detail: "aborted" };
    el.focus({ preventScroll: true });
    await deps.flyTo(el.getBoundingClientRect(), { kind: "field", field });
    if (gen !== generation || !el.isConnected) return { ok: false, detail: "aborted" };

    if (el instanceof HTMLSelectElement) {
      const opts = Array.from(el.options).map((o) => o.value);
      const wanted = value.trim().toLowerCase();
      const match =
        opts.find((v) => v.toLowerCase() === wanted) ??
        opts.find((v) => v && (v.toLowerCase().includes(wanted) || wanted.includes(v.toLowerCase()))) ??
        (opts.includes("other") ? "other" : opts.includes("Other") ? "Other" : opts[opts.length - 1]);
      setNativeValue(el, match ?? "");
      fireChange(el);
      el.blur();
      return { ok: true };
    }
    if (el instanceof HTMLInputElement && (el.type === "date" || el.type === "datetime-local")) {
      setNativeValue(el, normaliseDate(el, value));
      fireChange(el);
      el.blur();
      return { ok: true };
    }
    const done = await replaceTyping(el, value);
    return done ? { ok: true } : { ok: false, detail: "aborted" };
  }

  /** Type a deferred statement once the capture step's box is on the page. */
  async function flushPending(): Promise<boolean> {
    if (pendingStatement == null) return false;
    const box = resolveField("report.statement");
    if (!(box instanceof HTMLTextAreaElement)) return false;
    const value = pendingStatement;
    pendingStatement = null;
    if (box.value.trim() === value.trim()) return true;
    const r = await fill("report.statement", value);
    if (!r.ok) pendingStatement = value;
    return r.ok;
  }

  async function submit(form: "report" | "sos"): Promise<Result> {
    const page = form === "report" ? "/intake/new" : "/sos";
    if (!onPage(page)) return { ok: false, detail: "wrong-page" };
    const f = document.querySelector(FORM_ANCHOR[form])?.closest("form");
    const btn = f?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!btn) return { ok: false, detail: "submit-not-found" };
    btn.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    await deps.flyTo(btn.getBoundingClientRect(), { kind: "submit", form });
    const liveBtn = btn.isConnected
      ? btn
      : document.querySelector(FORM_ANCHOR[form])?.closest("form")?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!liveBtn) return { ok: false, detail: "submit-not-found" };
    liveBtn.click();
    if (form === "sos") {
      // The SOS form asks for confirmation; the user already confirmed by voice.
      const dlg = (await waitFor("dialog[open]", 2500)) as HTMLDialogElement | null;
      const buttons = dlg ? Array.from(dlg.querySelectorAll<HTMLButtonElement>("button[type='button']")) : [];
      const confirmBtn = buttons[buttons.length - 1]; // ConfirmDialog: [Cancel, Confirm]
      if (dlg && confirmBtn) {
        await sleep(300);
        confirmBtn.click();
      }
    }
    return { ok: true };
  }


  /** Wait until the step changes or a forward link appears (≤ timeout). */
  async function waitForProgress(from: IntakeStep | null, timeout: number): Promise<"step" | "link" | "none"> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (readIntakeStep() !== from) return "step";
      if (forwardLink(from)) return "link";
      await sleep(150);
    }
    return "none";
  }

  /**
   * Fly to a control and activate it. The page can re-render while the mascot is flying
   * (e.g. router.refresh after a save), which replaces the DOM node; clicking the stale,
   * detached node would bypass React and — for links — make the browser do a full page
   * load that ends the call. So: re-resolve the element after the animation, and follow
   * same-origin links through the client router instead of a native click.
   */
  async function tapAndClick(el: HTMLElement, target: VoiceTarget, resolve?: () => HTMLElement | null) {
    el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    await sleep(reducedMotion() ? 0 : 250);
    await deps.flyTo(el.getBoundingClientRect(), target);
    const live = el.isConnected ? el : resolve?.() ?? null;
    if (!live) return;
    if (live instanceof HTMLAnchorElement) {
      const href = live.getAttribute("href") ?? "";
      if (href.startsWith("/") && !href.startsWith("//")) {
        deps.push(href);
        return;
      }
    }
    live.click();
  }

  /** Press the current intake step's primary forward control and wait for the next step. */
  async function advanceIntake(expected?: string): Promise<Result> {
    if (!intakeId()) return { ok: false, detail: "not-on-intake" };
    const start = readIntakeStep();
    // Only press when the page is on the step the dialog expects.
    if (expected && start !== expected.replace(/:saved$/, "")) return { ok: false, detail: "wrong-step" };
    // Consent is never advanced by voice — the officer records it on screen.
    if (start === "consent") return { ok: false, detail: "consent-manual" };
    if (start === "capture") {
      if (pendingStatement != null) await waitForEl(() => resolveField("report.statement"), 4000);
      await flushPending();
      const box = resolveField("report.statement");
      if (box && !box.value.trim() && !forwardLink("capture")) return { ok: false, detail: "statement-empty" };
    }
    for (let round = 0; round < 3; round++) {
      const cur = readIntakeStep();
      if (cur !== start) return { ok: true, detail: cur ?? undefined };
      const link = forwardLink(cur);
      if (link) {
        await tapAndClick(link, { kind: "submit", form: "report" }, () => forwardLink(cur));
        const r = await waitForProgress(cur, 10000);
        if (r === "step") return { ok: true, detail: readIntakeStep() ?? undefined };
        continue;
      }
      const pf = primaryStepForm();
      if (!pf) return { ok: false, detail: "no-forward-control" };
      const readBack = pf.form.querySelector<HTMLInputElement>('input[name="readBack"]');
      if (readBack && !readBack.checked) readBack.click();
      const method = pf.form.querySelector<HTMLInputElement>('input[name="method"]:checked');
      if (pf.form.querySelector('input[name="method"]') && !method) {
        pf.form.querySelector<HTMLInputElement>('input[name="method"][value="typed"]')?.click();
        await sleep(150);
      }
      await tapAndClick(pf.button, { kind: "submit", form: "report" }, () => primaryStepForm()?.button ?? null);
      // a step may ask for confirmation (e.g. "Generate draft")
      const dlg = (await waitFor("dialog[open]", 1500)) as HTMLDialogElement | null;
      if (dlg) {
        const buttons = Array.from(dlg.querySelectorAll<HTMLButtonElement>("button[type='button']"));
        await sleep(250);
        buttons[buttons.length - 1]?.click();
      }
      const r = await waitForProgress(cur, 10000);
      if (r === "step") return { ok: true, detail: readIntakeStep() ?? undefined };
      if (r === "none") return { ok: false, detail: "no-progress" };
      // "link": the form saved and a Continue link appeared → next round clicks it
    }
    const end = readIntakeStep();
    return end !== start ? { ok: true, detail: end ?? undefined } : { ok: false, detail: "no-progress" };
  }

  async function openCase(query: string): Promise<Result> {
    const q = query.trim();
    if (q.length < 1) return { ok: false, detail: "empty-query" };
    let hits: Awaited<ReturnType<typeof paletteSearchCases>> = [];
    try {
      hits = await paletteSearchCases(q.length < 2 ? q.padStart(2, "0") : q);
    } catch {
      return { ok: false, detail: "search-failed" };
    }
    const digits = q.replace(/\D/g, "");
    const best =
      (digits && hits.find((c) => c.reference.replace(/\D/g, "").endsWith(digits.padStart(5, "0")))) ||
      (digits && hits.find((c) => c.reference.endsWith(digits))) ||
      hits[0];
    if (!best) return { ok: false, detail: "not-found" };
    abort();
    await deps.flyTo(null, { kind: "center" });
    deps.push(`/cases/${best.id}`);
    return { ok: true, detail: best.reference };
  }

  return {
    /** Cancel any in-flight typing (e.g. the user navigated manually). */
    abort,
    /** Exposed for the dev test hook. */
    advanceIntake,
    /** Type a deferred statement if the capture step is now on screen. */
    flushPending,
    hasPending: () => pendingStatement != null,
    async run(action: VoiceAction): Promise<Result> {
      try {
        switch (action.type) {
          case "advanceIntake":
            return await advanceIntake(action.step);
          case "navigate":
            return await navigate(action.href);
          case "fill":
            return await fill(action.field, action.value);
          case "submit":
            return await submit(action.form);
          case "openCase":
            return await openCase(action.query);
          case "fly":
            await deps.flyTo(null, action.to);
            return { ok: true };
          case "end":
            abort();
            await deps.flyTo(null, { kind: "home" });
            return { ok: true };
          default:
            return { ok: false, detail: "unknown-action" };
        }
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}

/** Dev/test helper: current values of every voice-fillable field on the page. */
export function readVoiceFields(): Partial<Record<VoiceField, string>> {
  const out: Partial<Record<VoiceField, string>> = {};
  for (const f of Object.keys(FIELD_MAP) as VoiceField[]) {
    const el = resolveField(f);
    if (el) out[f] = el.value;
  }
  return out;
}
