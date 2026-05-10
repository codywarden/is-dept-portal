export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { requireUser } from "../../lib/auth/requireRole";
import FirmwareCard from "./FirmwareCard";

type Role = "admin" | "manager" | "user" | "guest";

export default async function FrankiePage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, page_permissions")
    .eq("id", user.id)
    .single();

  const role = ((profile?.role ?? "user") as Role);
  const pagePermissions = (profile?.page_permissions as Record<string, boolean> | null) ?? {};

  const hasAccess =
    role === "admin" ||
    pagePermissions["frankie"] ||
    pagePermissions["frankie/planter"] ||
    pagePermissions["frankie/remote"] ||
    pagePermissions["frankie_firmware"];

  if (!hasAccess) redirect("/dashboard");

  const canManageFirmware = role === "admin" || !!pagePermissions["frankie_firmware"];
  const canPlanter = role === "admin" || !!pagePermissions["frankie"] || !!pagePermissions["frankie/planter"];
  const canRemote  = role === "admin" || !!pagePermissions["frankie"] || !!pagePermissions["frankie/remote"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-green-800 mb-1">🚜 Frankie</h1>
          <p className="text-green-700">Autonomous Tractor</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {canPlanter && (
            <a
              href="/dashboard/frankie/planter"
              style={{ textDecoration: "none" }}
              className="bg-white rounded-lg shadow-lg p-8 border-t-4 border-green-600 hover:shadow-xl transition-shadow text-center block"
            >
              <div className="text-5xl mb-4">🌱</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Planter Status</h2>
              <p className="text-sm text-gray-500 mb-4">Monitor planter sensors, fault alerts, and live field data</p>
              <div className="text-green-600 font-semibold">View Status →</div>
            </a>
          )}

          {canRemote && (
            <a
              href="/dashboard/frankie/remote"
              style={{ textDecoration: "none" }}
              className="bg-white rounded-lg shadow-lg p-8 border-t-4 border-green-700 hover:shadow-xl transition-shadow text-center block"
            >
              <div className="text-5xl mb-4">🎮</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Remote Control</h2>
              <p className="text-sm text-gray-500 mb-4">Control Frankie remotely with trackpad, keyboard, and commands</p>
              <div className="text-green-600 font-semibold">Open Remote →</div>
            </a>
          )}
        </div>

        <FirmwareCard canManageFirmware={canManageFirmware} />

      </div>
    </div>
  );
}
