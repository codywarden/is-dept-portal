import AdminDashboard from "./AdminDashboard";
import { requireRole } from "../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  await requireRole(["admin"]);

  return <AdminDashboard />;
}
