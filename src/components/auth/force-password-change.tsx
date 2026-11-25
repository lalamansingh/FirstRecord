import { KeyRound } from "lucide-react";
import { ActionForm, SubmitButton, FieldError } from "@/components/forms";
import { inputClass } from "@/components/ui";
import { changePasswordAction } from "@/app/(app)/settings/actions";
import { logoutAction } from "@/app/login/actions";
import { getTr } from "@/lib/i18n/server";

/** Blocking screen shown until a user with must_change_password sets a new password. */
export async function ForcePasswordChange({ name }: { name: string }) {
  const tr = await getTr();
  const fields = [
    { name: "current", label: tr("Current (temporary) password"), auto: "current-password" },
    { name: "next", label: tr("New password"), auto: "new-password", hint: tr("At least 12 characters, with letters and numbers.") },
    { name: "confirm", label: tr("Confirm new password"), auto: "new-password" },
  ];
  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-navy-700" aria-hidden />
        <h1 className="text-base font-semibold text-slate-900">{tr("Set a new password to continue")}</h1>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {tr("{name}, your account was created or reset with a temporary password. Choose a new password before using FirstRecord.", { name })}
      </p>
      <ActionForm action={changePasswordAction} className="mt-5 space-y-4" success={tr("Password changed.")}>
        {fields.map((f) => (
          <div key={f.name}>
            <label htmlFor={`fpc-${f.name}`} className="mb-1 block text-sm font-medium text-slate-800">{f.label}</label>
            <input id={`fpc-${f.name}`} name={f.name} type="password" required autoComplete={f.auto} className={inputClass} />
            <FieldError name={f.name} />
            {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
          </div>
        ))}
        <SubmitButton className="w-full">{tr("Change password")}</SubmitButton>
      </ActionForm>
      <form action={logoutAction} className="mt-3 text-center">
        <button type="submit" className="text-sm text-slate-600 underline hover:text-slate-900">{tr("Sign out")}</button>
      </form>
    </div>
  );
}
