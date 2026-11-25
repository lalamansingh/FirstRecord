"use client";
import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { ActionForm, SubmitButton, FieldError, useFieldError, type ActionResult } from "@/components/forms";
import { inputClass, buttonClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

type Action = (p: ActionResult, fd: FormData) => Promise<ActionResult>;

export interface Option {
  value: string;
  label: string;
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  let s = Array.from(arr, (n) => chars[n % chars.length]).join("");
  if (!/[0-9]/.test(s)) s = s.slice(0, 15) + "7";
  return s;
}

function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-800">
      {children}
      {required && <span className="ml-0.5 text-red-700" aria-hidden>*</span>}
    </label>
  );
}

function Input({ name, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  const err = useFieldError(name);
  return (
    <>
      <input id={name} name={name} className={inputClass} aria-invalid={!!err} aria-describedby={err ? `${name}-error` : undefined} {...rest} />
      <FieldError name={name} />
    </>
  );
}

function Select({ name, options, defaultValue, placeholder }: { name: string; options: Option[]; defaultValue?: string; placeholder?: string }) {
  const err = useFieldError(name);
  return (
    <>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} className={inputClass} aria-invalid={!!err}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <FieldError name={name} />
    </>
  );
}

export function PasswordInput({ name = "password", label }: { name?: string; label?: string }) {
  const tr = useT();
  const [value, setValue] = useState("");
  return (
    <div>
      <Label htmlFor={name} required>{label ?? tr("Temporary password")}</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input name={name} type="text" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} required spellCheck={false} />
        </div>
        <button type="button" className={buttonClass("secondary")} onClick={() => setValue(generatePassword())}>
          <KeyRound className="h-4 w-4" aria-hidden /> {tr("Generate")}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{tr("At least 12 characters with letters and numbers. The user must change it at first sign-in. Share it through a secure channel — it is not shown again.")}</p>
    </div>
  );
}

export function CreateUserForm({
  action,
  roles,
  stations,
  fixedStation,
}: {
  action: Action;
  roles: Option[];
  stations: Option[];
  fixedStation: Option | null;
}) {
  const tr = useT();
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" required>{tr("Full name")}</Label>
          <Input name="name" required maxLength={120} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="email" required>{tr("Email")}</Label>
          <Input name="email" type="email" required maxLength={200} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="roleId" required>{tr("Role")}</Label>
          <Select name="roleId" options={roles} placeholder={tr("Select a role")} />
          <p className="mt-1 text-xs text-slate-500">{tr("Only roles whose permissions you hold yourself are listed.")}</p>
        </div>
        <div>
          <Label htmlFor="stationId">{tr("Station")}</Label>
          {fixedStation ? (
            <>
              <input type="hidden" name="stationId" value={fixedStation.value} />
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{fixedStation.label}</p>
            </>
          ) : (
            <Select name="stationId" options={stations} placeholder={tr("No station (System Administrator only)")} />
          )}
        </div>
        <div>
          <Label htmlFor="badgeNumber">{tr("Badge / employee number")}</Label>
          <Input name="badgeNumber" maxLength={40} autoComplete="off" />
        </div>
      </div>
      <PasswordInput />
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Link href="/admin/users" className={buttonClass("secondary")}>{tr("Cancel")}</Link>
        <SubmitButton pendingLabel={tr("Creating…")}>{tr("Create user")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditUserForm({
  action,
  user,
  roles,
  stations,
  fixedStation,
  isSelf,
}: {
  action: Action;
  user: { id: string; name: string; badgeNumber: string | null; roleId: string; stationId: string | null };
  roles: Option[];
  stations: Option[];
  fixedStation: Option | null;
  isSelf: boolean;
}) {
  const tr = useT();
  return (
    <ActionForm
      action={action}
      className="space-y-4"
      confirmTitle={tr("Save account changes?")}
      confirm={tr("Changing a role or station signs the user out of all sessions and takes effect immediately. This change is recorded in the audit log.")}
      confirmLabel={tr("Save changes")}
    >
      <input type="hidden" name="userId" value={user.id} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" required>{tr("Full name")}</Label>
          <Input name="name" defaultValue={user.name} required maxLength={120} />
        </div>
        <div>
          <Label htmlFor="badgeNumber">{tr("Badge / employee number")}</Label>
          <Input name="badgeNumber" defaultValue={user.badgeNumber ?? ""} maxLength={40} />
        </div>
        <div>
          <Label htmlFor="roleId" required>{tr("Role")}</Label>
          {isSelf ? (
            <>
              <input type="hidden" name="roleId" value={user.roleId} />
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {roles.find((r) => r.value === user.roleId)?.label ?? tr("Current role")} — {tr("you cannot change your own role.")}
              </p>
            </>
          ) : (
            <Select name="roleId" options={roles} defaultValue={user.roleId} />
          )}
        </div>
        <div>
          <Label htmlFor="stationId">{tr("Station")}</Label>
          {fixedStation || isSelf ? (
            <>
              <input type="hidden" name="stationId" value={fixedStation?.value ?? user.stationId ?? ""} />
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {fixedStation?.label ?? stations.find((s) => s.value === user.stationId)?.label ?? tr("No station")}
              </p>
            </>
          ) : (
            <Select name="stationId" options={stations} defaultValue={user.stationId ?? ""} placeholder={tr("No station (System Administrator only)")} />
          )}
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <SubmitButton pendingLabel={tr("Saving…")}>{tr("Save changes")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function StatusActionForm({
  action,
  userId,
  status,
  label,
  description,
  danger,
}: {
  action: Action;
  userId: string;
  status: "active" | "suspended" | "deactivated";
  label: string;
  description: string;
  danger?: boolean;
}) {
  const tr = useT();
  return (
    <ActionForm action={action} confirmTitle={`${label}?`} confirm={description} confirmLabel={label} danger={danger} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={status} />
      {status !== "active" && (
        <div>
          <label htmlFor={`reason-${status}`} className="mb-1 block text-xs font-medium text-slate-700">{tr("Reason (recorded in audit log)")}</label>
          <input id={`reason-${status}`} name="reason" maxLength={300} className={inputClass} />
        </div>
      )}
      <SubmitButton variant={danger ? "danger" : "secondary"} size="sm">{label}</SubmitButton>
    </ActionForm>
  );
}

export function SimpleUserAction({
  action,
  userId,
  label,
  confirm,
  success,
}: {
  action: Action;
  userId: string;
  label: string;
  confirm: string;
  success?: string;
}) {
  return (
    <ActionForm action={action} confirmTitle={`${label}?`} confirm={confirm} confirmLabel={label} success={success}>
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="secondary" size="sm">{label}</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ action, userId }: { action: Action; userId: string }) {
  const tr = useT();
  return (
    <ActionForm
      action={action}
      resetOnSuccess
      confirmTitle={tr("Reset password?")}
      confirm={tr("The user's current password stops working immediately, all their sessions are signed out, and they must set a new password at next sign-in.")}
      confirmLabel={tr("Reset password")}
      className="space-y-3"
    >
      <input type="hidden" name="userId" value={userId} />
      <PasswordInput />
      <SubmitButton variant="secondary" size="sm">{tr("Reset password")}</SubmitButton>
    </ActionForm>
  );
}
