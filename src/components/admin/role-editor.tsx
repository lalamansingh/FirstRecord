"use client";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ActionForm, SubmitButton, type ActionResult } from "@/components/forms";
import { useT } from "@/lib/i18n/client";

type Action = (p: ActionResult, fd: FormData) => Promise<ActionResult>;

export interface PermGroup {
  label: string;
  perms: { key: string; description: string; grantable: boolean }[];
}

export function RolePermissionEditor({
  action,
  roleKey,
  initial,
  groups,
  hidden,
  children,
  submitLabel,
  create,
  readOnly,
}: {
  action: Action;
  roleKey: string;
  initial: string[];
  groups: PermGroup[];
  hidden?: Record<string, string>;
  children?: ReactNode;
  submitLabel?: string;
  create?: boolean;
  readOnly?: boolean;
}) {
  const tr = useT();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const initialSet = useMemo(() => new Set(initial), [initial]);
  const added = [...selected].filter((p) => !initialSet.has(p));
  const removed = initial.filter((p) => !selected.has(p));
  const sysAdminContent = roleKey === "system_admin" && added.some((p) => p === "statement.view" || p === "recording.view" || p.startsWith("case.view"));

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const confirm = (
    <div className="space-y-2">
      {create ? (
        <p>{tr(selected.size === 1 ? "The new role will have {count} permission." : "The new role will have {count} permissions.", { count: selected.size })}</p>
      ) : added.length + removed.length === 0 ? (
        <p>{tr("No permission changes selected.")}</p>
      ) : (
        <>
          <p>{tr("This changes access for every user with this role, effective on their next request.")}</p>
          {added.length > 0 && (
            <div>
              <p className="font-medium text-emerald-800">{tr("Added ({count})", { count: added.length })}</p>
              <ul className="ml-4 list-disc font-mono text-xs">{added.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {removed.length > 0 && (
            <div>
              <p className="font-medium text-red-800">{tr("Removed ({count})", { count: removed.length })}</p>
              <ul className="ml-4 list-disc font-mono text-xs">{removed.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </>
      )}
      {sysAdminContent && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
          {tr("Warning: you are granting the System Administrator role access to case or statement content. By default, technical administrators should not see statement content. Only proceed if this is authorized by policy.")}
        </p>
      )}
    </div>
  );

  return (
    <ActionForm
      action={action}
      confirmTitle={create ? tr("Create role?") : tr("Change role permissions?")}
      confirm={confirm}
      confirmLabel={create ? tr("Create role") : tr("Apply changes")}
      danger={sysAdminContent}
      className="space-y-5"
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {sysAdminContent && (
        <div role="alert" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {tr("Granting content access to System Administrators removes the default separation between technical and case access.")}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g.label} className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-500">{g.label}</legend>
            <ul className="space-y-1.5">
              {g.perms.map((p) => {
                const checked = selected.has(p.key);
                const disabled = readOnly || (!p.grantable && !checked);
                return (
                  <li key={p.key}>
                    <label className={`flex items-start gap-2 text-sm ${disabled ? "text-slate-400" : "text-slate-800"}`}>
                      <input
                        type="checkbox"
                        name="permissions"
                        value={p.key}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(p.key)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700 focus-visible:ring-2 focus-visible:ring-navy-700"
                      />
                      <span>
                        {p.description}
                        <span className="ml-1 font-mono text-[11px] text-slate-400">{p.key}</span>
                        {!p.grantable && <span className="ml-1 text-[11px] text-slate-400">({tr("you don't hold this")})</span>}
                      </span>
                    </label>
                    {/* Checked but disabled checkboxes are not submitted; keep them. */}
                    {checked && disabled && <input type="hidden" name="permissions" value={p.key} />}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
      {!readOnly && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-600" aria-live="polite">
            {create ? tr("{count} selected", { count: selected.size }) : added.length + removed.length === 0 ? tr("No unsaved changes") : tr("{added} to add, {removed} to remove", { added: added.length, removed: removed.length })}
          </p>
          <SubmitButton disabled={!create && added.length + removed.length === 0}>{submitLabel ?? tr("Save permissions")}</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
