import { requireUser } from "../../lib/auth/requireRole";
import { createSupabaseServer } from "../../lib/supabase/server";
import CheckClient from "./CheckClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckPage() {
  await requireUser();

  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();

  let role: "admin" | "manager" | "user" | "guest" = "user";
  if (authData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();
    role = (profile?.role ?? "user") as "admin" | "manager" | "user" | "guest";
  }

  return <CheckClient role={role} />;
}
