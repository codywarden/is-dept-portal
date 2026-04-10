import UploadClient from "./UploadClient";
import { requireUser } from "../../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UploadPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "user") as "admin" | "manager" | "user" | "guest";

  return <UploadClient role={role} />;
}
