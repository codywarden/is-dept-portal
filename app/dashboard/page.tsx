export const dynamic = "force-dynamic";
export const revalidate = 0;

import DashboardClient from "./DashboardClient";
import { requireUser } from "../lib/auth/requireRole";

type Role = "admin" | "manager" | "user" | "guest";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name, email, location, locations, page_permissions")
    .eq("id", user.id)
    .single();

  const role = ((profile?.role ?? "user") as Role);

return (
  <DashboardClient
    role={role}
    profile={{
      email: profile?.email ?? user.email ?? "",
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      locations: (profile?.locations as string[] | null) ?? (profile?.location ? [profile.location] : []),
      pagePermissions: (profile?.page_permissions as Record<string, boolean> | null) ?? null,
    }}
  />
);
}


