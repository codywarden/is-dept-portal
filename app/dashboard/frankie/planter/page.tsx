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

  const isAdmin = role === "admin";
  const p = pagePermissions;

  const hasAnyAccess = isAdmin
    || !!p["frankie"] || !!p["frankie/planter"] || !!p["frankie_planter_firmware"]
    || !!p["frankie/planter_boards"] || !!p["frankie_planter_boards_manage"];
  if (!hasAnyAccess) redirect("/dashboard");

  const canControl        = isAdmin || !!p["frankie"] || !!p["frankie/planter"];
  const canManageFirmware = isAdmin || !!p["frankie_planter_firmware"];
  const canViewSettings   = canControl || !!p["frankie_planter_settings_view"] || !!p["frankie_planter_settings_edit"];
  const canEditSettings   = canControl || !!p["frankie_planter_settings_edit"];
  const canViewBoards     = isAdmin || !!p["frankie/planter_boards"] || !!p["frankie_planter_boards_manage"];
  const canManageBoards   = isAdmin || !!p["frankie_planter_boards_manage"];
  const canDeleteBoards   = isAdmin || !!p["frankie_planter_boards_delete"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <PlanterCard canControl={canControl} canViewSettings={canViewSettings} canEditSettings={canEditSettings} />
        <PlanterFirmwareCard canManage={canManageFirmware} />
        {canViewBoards && <PlanterBoardsCard canManage={canManageBoards} canDelete={canDeleteBoards} />}
      </div>
    </div>
  );
}
