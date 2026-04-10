import AdminDashboard from "./AdminDashboard";
import { requireRole } from "../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const { role } = await requireRole(["admin", "manager"]);

  return <AdminDashboard role={role} />;
}
