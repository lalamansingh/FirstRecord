import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";

export default async function AdminIndex() {
  const user = await requirePagePermission("user.manage", "role.manage");
  redirect(can(user, "user.manage") ? "/admin/users" : "/admin/roles");
}
