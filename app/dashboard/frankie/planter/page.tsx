export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth/requireRole";
import PlanterCard from "../PlanterCard";
import PlanterFirmwareCard from "../PlanterFirmwareCard";
import PlanterBoardsCard from "../PlanterBoardsCard";

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

  if (role !== "admin" && !pagePermissions["frankie"] && !pagePermissions["frankie/planter"] && !pagePermissions["frankie_planter_firmware"]) {
    redirect("/dashboard");
  }

  const isAdmin           = role === "admin";
  const canControl        = isAdmin || !!pagePermissions["frankie"] || !!pagePermissions["frankie/planter"];
  const canManageFirmware = isAdmin || !!pagePermissions["frankie_planter_firmware"];
  const canViewSettings   = canControl || isAdmin || !!pagePermissions["frankie_planter_settings_view"] || !!pagePermissions["frankie_planter_settings_edit"];
  const canEditSettings   = canControl || isAdmin || !!pagePermissions["frankie_planter_settings_edit"];
  const canViewBoards     = isAdmin || !!pagePermissions["frankie_planter_boards"] || !!pagePermissions["frankie_planter_boards_manage"];
  const canManageBoards   = isAdmin || !!pagePermissions["frankie_planter_boards_manage"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <PlanterCard canControl={canControl} canViewSettings={canViewSettings} canEditSettings={canEditSettings} />
        <PlanterFirmwareCard canManage={canManageFirmware} />
        {canViewBoards && <PlanterBoardsCard canManage={canManageBoards} />}
      </div>
    </div>
  );
}
