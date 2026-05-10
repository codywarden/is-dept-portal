export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth/requireRole";
import PlanterCard from "../PlanterCard";

type Role = "admin" | "manager" | "user" | "guest";

export default async function PlanterPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, page_permissions")
    .eq("id", user.id)
    .single();

  const role = ((profile?.role ?? "user") as Role);
  const pagePermissions = (profile?.page_permissions as Record<string, boolean> | null) ?? {};

  if (role !== "admin" && !pagePermissions["frankie"] && !pagePermissions["frankie/planter"] && !pagePermissions["frankie_firmware"]) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <a href="/dashboard/frankie" className="text-sm text-green-700 hover:text-green-900 block mb-6">← Back to Frankie</a>
        <PlanterCard />
      </div>
    </div>
  );
}
