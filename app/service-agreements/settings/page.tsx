import SettingsClient from "./SettingsClient";
import { requireRole } from "../../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  await requireRole(["admin"]);

  return <SettingsClient />;
}
