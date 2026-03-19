import { requireRole } from "../../lib/auth/requireRole";
import ReconcileClient from "./ReconcileClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReconcilePage() {
  const { role } = await requireRole(["admin"]);

  return <ReconcileClient role={role} />;
}
