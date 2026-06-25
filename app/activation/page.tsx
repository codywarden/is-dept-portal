import ActivationClient from "./ActivationClient";
import { requireUser } from "../lib/auth/requireRole";
import { createSupabaseServer } from "../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ActivationPage() {
  await requireUser();

  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  
  let role: "admin" | "manager" | "user" | "guest" = "user";
  let canApproveAbsorption = false;
  if (authData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, page_permissions")
      .eq("id", authData.user.id)
      .single();
    role = (profile?.role ?? "user") as "admin" | "manager" | "user" | "guest";
    const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;
    canApproveAbsorption = role === "admin" || role === "manager" || perms["activation/reconcile-approve"] === true;
  }

  return <ActivationClient role={role} canApproveAbsorption={canApproveAbsorption} />;
}
