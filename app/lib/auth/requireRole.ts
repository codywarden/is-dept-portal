import { redirect } from "next/navigation";
import { createSupabaseServer } from "../supabase/server";

export type Role = "admin" | "manager" | "user" | "guest";

export async function requireUser() {
  const supabase = await createSupabaseServer(); // ✅ MUST await
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireRole(allowed: Role[]) {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "user") as Role;

  if (!allowed.includes(role)) redirect("/dashboard");

  return { supabase, user, role };
}
