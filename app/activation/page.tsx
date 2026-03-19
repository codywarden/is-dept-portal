import ActivationClient from "./ActivationClient";
import { requireUser } from "../lib/auth/requireRole";
import { createSupabaseServer } from "../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ActivationPage() {
  await requireUser();

  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  
  let role: "admin" | "verifier" | "viewer" = "viewer";
  if (authData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();
    role = (profile?.role ?? "viewer") as "admin" | "verifier" | "viewer";
  }

  return <ActivationClient role={role} />;
}
