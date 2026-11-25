"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import { requireActor, requestIp } from "@/lib/auth/session";
import { getTr } from "@/lib/i18n/server";
import {
  createUser,
  updateUserRoleStation,
  setUserStatus,
  resetUserPassword,
  unlockUser,
  revokeSessions,
  updateRolePermissions,
  createRole,
  renameRole,
  deleteRole,
} from "@/lib/domain/admin";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);

export async function createUserAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const input = z
      .object({
        name: zs.required("Name", 120),
        email: emailSchema,
        roleId: zs.required("Role", 64),
        stationId: zs.optional(64),
        badgeNumber: zs.optional(40),
        password: z.string().min(1, "Temporary password is required").max(200),
      })
      .parse(Object.fromEntries(fd));
    const id = createUser(actor, input, await requestIp());
    revalidatePath("/admin/users");
    return { ok: true, message: "User created. Share the temporary password through a secure channel.", redirectTo: `/admin/users/${id}` };
  });
}

export async function updateUserAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const input = z
      .object({
        userId: zs.id(),
        name: zs.required("Name", 120),
        roleId: zs.required("Role", 64),
        stationId: zs.optional(64),
        badgeNumber: zs.optional(40),
      })
      .parse(Object.fromEntries(fd));
    updateUserRoleStation(actor, input.userId, input, await requestIp());
    revalidatePath(`/admin/users/${input.userId}`);
    revalidatePath("/admin/users");
    return { ok: true, message: "User updated." };
  });
}

export async function setUserStatusAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const input = z
      .object({ userId: zs.id(), status: z.enum(["active", "suspended", "deactivated"]), reason: zs.text(300).default("") })
      .parse(Object.fromEntries(fd));
    setUserStatus(actor, input.userId, input.status, input.reason, await requestIp());
    revalidatePath(`/admin/users/${input.userId}`);
    revalidatePath("/admin/users");
    return { ok: true, message: input.status === "active" ? "Account reactivated." : input.status === "suspended" ? "Account suspended. Active sessions were signed out." : "Account deactivated. Active sessions were signed out." };
  });
}

export async function resetPasswordAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const input = z.object({ userId: zs.id(), password: z.string().min(1, "Enter a temporary password").max(200) }).parse(Object.fromEntries(fd));
    resetUserPassword(actor, input.userId, input.password, await requestIp());
    revalidatePath(`/admin/users/${input.userId}`);
    return { ok: true, message: "Password reset. The user must change it at next sign-in." };
  });
}

export async function unlockUserAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const { userId } = z.object({ userId: zs.id() }).parse(Object.fromEntries(fd));
    unlockUser(actor, userId, await requestIp());
    revalidatePath(`/admin/users/${userId}`);
    return { ok: true, message: "Account unlocked." };
  });
}

export async function revokeSessionsAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const { userId } = z.object({ userId: zs.id() }).parse(Object.fromEntries(fd));
    revokeSessions(actor, userId, await requestIp());
    revalidatePath(`/admin/users/${userId}`);
    return { ok: true, message: "All sessions for this user were signed out." };
  });
}

export async function updateRolePermissionsAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("role.manage");
    const roleId = zs.required("Role", 64).parse(fd.get("roleId"));
    const perms = fd.getAll("permissions").map(String);
    const { added, removed } = updateRolePermissions(actor, roleId, perms, await requestIp());
    revalidatePath("/admin/roles");
    revalidatePath(`/admin/roles/${roleId}`);
    if (!added.length && !removed.length) return { ok: true, message: "No changes to save." };
    return { ok: true, message: (await getTr())("Permissions updated ({a} added, {r} removed). Affected users get the new permissions on their next request.", { a: added.length, r: removed.length }) };
  });
}

export async function createRoleAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("role.manage");
    const input = z.object({ name: zs.required("Role name", 60), description: zs.text(300).default("") }).parse({
      name: fd.get("name"),
      description: fd.get("description") ?? "",
    });
    const id = createRole(actor, { ...input, permissions: fd.getAll("permissions").map(String) }, await requestIp());
    revalidatePath("/admin/roles");
    return { ok: true, message: "Role created.", redirectTo: `/admin/roles/${id}` };
  });
}

export async function renameRoleAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("role.manage");
    const input = z
      .object({ roleId: zs.required("Role", 64), name: zs.required("Role name", 60), description: zs.text(300).default("") })
      .parse(Object.fromEntries(fd));
    renameRole(actor, input.roleId, input, await requestIp());
    revalidatePath(`/admin/roles/${input.roleId}`);
    revalidatePath("/admin/roles");
    return { ok: true, message: "Role details saved." };
  });
}

export async function deleteRoleAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("role.manage");
    const roleId = zs.required("Role", 64).parse(fd.get("roleId"));
    deleteRole(actor, roleId, await requestIp());
    revalidatePath("/admin/roles");
    return { ok: true, message: "Role deleted.", redirectTo: "/admin/roles" };
  });
}
