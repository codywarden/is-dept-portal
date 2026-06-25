import { requireRole } from "../../lib/auth/requireRole";
import ReconcileClient from "./ReconcileClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReconcilePage() {
  const { supabase, user, role } = await requireRole(["admin", "manager", "user", "guest"]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("page_permissions, first_name, last_name")
    .eq("id", user.id)
    .single();

  const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;
  const canAutoReconcile = role === "admin" || perms["activation/auto-reconcile"] === true;
  const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user.email || "";

  return <ReconcileClient role={role} canAutoReconcile={canAutoReconcile} userName={userName} />;
}
