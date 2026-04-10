import SoldUploadClient from "./SoldUploadClient";
import { requireUser } from "../../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "manager" | "user" | "guest";

export default async function SoldUploadPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, location")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "user") as Role;

  return <SoldUploadClient role={role} userLocation={profile?.location ?? null} />;
}
