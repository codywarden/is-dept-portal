export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import FrankieClient from "./FrankieClient";
import { requireUser } from "../../lib/auth/requireRole";

type Role = "admin" | "verifier" | "viewer";

export default async function FrankiePage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name, email, location, locations, page_permissions")
    .eq("id", user.id)
    .single();

  const role = ((profile?.role ?? "viewer") as Role);
  const pagePermissions = (profile?.page_permissions as Record<string, boolean> | null) ?? {};

  // Admins always have access; others need the frankie permission
  if (role !== "admin" && !pagePermissions["frankie"]) {
    redirect("/dashboard");
  }

  return (
    <FrankieClient
      role={role}
      profile={{
        email: profile?.email ?? user.email ?? "",
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        locations: (profile?.locations as string[] | null) ?? (profile?.location ? [profile.location] : []),
        pagePermissions: pagePermissions,
      }}
    />
  );
}
