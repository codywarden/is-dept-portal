import { requireRole } from "../../lib/auth/requireRole";
import { createSupabaseAdmin } from "../../lib/supabase/admin";
import CostAbsorptionsClient from "./CostAbsorptionsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CostAbsorptionsPage() {
  const { user, role } = await requireRole(["admin", "manager", "user", "guest"]);

  const db = createSupabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("page_permissions")
    .eq("id", user.id)
    .single();

  const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;
  const canApprove =
    role === "admin" ||
    role === "manager" ||
    perms["activation/reconcile-approve"] === true;

  return <CostAbsorptionsClient canApprove={canApprove} />;
}
