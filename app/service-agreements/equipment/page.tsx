import EquipmentClient from "./EquipmentClient";
import { requireUser } from "../../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "manager" | "user" | "guest";

export default async function EquipmentPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "user") as Role;

  return <EquipmentClient role={role} />;
}
