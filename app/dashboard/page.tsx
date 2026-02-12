export const dynamic = "force-dynamic";
export const revalidate = 0;

import DashboardClient from "./DashboardClient";
import { requireUser } from "../lib/auth/requireRole";

type Role = "admin" | "verifier" | "viewer";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name, email, location")
    .eq("id", user.id)
    .single();

  const role = ((profile?.role ?? "viewer") as Role);

return (
  <DashboardClient
    role={role}
    profile={{
      email: profile?.email ?? user.email ?? "",
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      location: profile?.location ?? "",
    }}
  />
);
}


