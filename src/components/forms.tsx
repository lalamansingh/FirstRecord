"use client";
import { useT } from "@/lib/i18n/client";
/**
 * Client form helpers wired to server actions that return ActionResult.
 *
 *   <ActionForm action={myAction} confirm="Are you sure?" success="Saved">
 *     <input name="x" /> <SubmitButton>Save</SubmitButton>
 *   </ActionForm>
 */
import { useActionState, useEffect, useRef, useState, createContext, useContext, startTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { buttonClass, cx } from "./ui";

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

const FieldErrorsContext = createContext<Record<string, string>>({});
export function useFieldError(name: string) {
  return useContext(FieldErrorsContext)[name];
}

export function ActionForm({
  action,
  children,
  confirm,
  confirmTitle,
  confirmLabel,
  danger,
  success,
  className,
  resetOnSuccess,
  onSuccess,
  id,
}: {
  action: Action;
  children: ReactNode;
  /** If set, a confirmation dialog is shown before submitting. */
  confirm?: ReactNode;
  confirmTitle?: string;
  confirmLabel?: string;
  danger?: boolean;
  success?: string;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: true });
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState<FormData | null>(null);
  // Each completed action yields a new state object; handle each result exactly once.
  const lastHandled = useRef<ActionResult | null>(state);
  const router = useRouter();
  const toast = useToast();
  const tr = useT();

  useEffect(() => {
    if (pending || lastHandled.current === state) return;
    lastHandled.current = state;
    if (state.ok) {
      const msg = state.message ?? success;
      if (msg) toast.show(msg, "success");
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
    } else {
      toast.show(state.error, "error");
    }
  }, [pending, state, success, resetOnSuccess, onSuccess, router, toast]);

  const fieldErrors = !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <FieldErrorsContext.Provider value={fieldErrors}>
      <form
        id={id}
        ref={formRef}
        className={className}
        noValidate={false}
        action={formAction}
        onSubmit={(e) => {
          if (confirm && !confirming) {
            e.preventDefault();
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const fd = new FormData(e.currentTarget, submitter);
            setConfirming(fd);
          }
        }}
      >
        {!state.ok && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </div>
        )}
        {children}
      </form>
      {confirming && (
        <ConfirmDialog
          title={confirmTitle ?? tr("Please confirm")}
          confirmLabel={confirmLabel}
          danger={danger}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const fd = confirming;
            setConfirming(null);
            startTransition(() => formAction(fd));
          }}
        >
          {confirm}
        </ConfirmDialog>
      )}
    </FieldErrorsContext.Provider>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tr = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(92vw,30rem)] overflow-hidden rounded-lg border border-slate-200 p-0 shadow-[0_4px_12px_rgb(16_24_40/0.08)] backdrop:bg-slate-900/40"
    >
      <div className="px-6 pb-5 pt-6">
        <h2 id="confirm-title" className="text-[17px] font-semibold leading-6 text-navy-900">{title}</h2>
        <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5">
        <button type="button" className={buttonClass("secondary")} onClick={onCancel} autoFocus>
          {tr("Cancel")}
        </button>
        <button type="button" className={buttonClass(danger ? "danger" : "primary")} onClick={onConfirm}>
          {confirmLabel ?? tr("Confirm")}
        </button>
      </div>
    </dialog>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size,
  name,
  value,
  className,
  disabled,
  pendingLabel,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
  name?: string;
  value?: string;
  className?: string;
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className={cx(buttonClass(variant, size), className)}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Shows the field error from the nearest ActionForm. */
export function FieldError({ name }: { name: string }) {
  const err = useFieldError(name);
  if (!err) return null;
  return <p id={`${name}-error`} className="mt-1 text-xs font-medium text-red-700">{err}</p>;
}

/* ---------------- Toasts (aria-live) ---------------- */

type ToastItem = { id: number; text: string; tone: "success" | "error" | "info" };
const ToastContext = createContext<{ show: (text: string, tone?: ToastItem["tone"]) => void }>({ show: () => {} });
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const tr = useT();
  const [items, setItems] = useState<ToastItem[]>([]);
  const [api] = useState(() => ({
    show: (text: string, tone: ToastItem["tone"] = "info") => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, text, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000);
    },
  }));
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,24rem)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 shadow-[0_4px_12px_rgb(16_24_40/0.08)]",
              t.tone === "success" && "text-slate-800",
              t.tone === "error" && "text-slate-800",
              t.tone === "info" && "text-slate-800",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            ) : t.tone === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            ) : null}
            <span className="flex-1">{t.text}</span>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-700"
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
              aria-label={tr("Dismiss notification")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
