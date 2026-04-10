import { requireRole } from "../../lib/auth/requireRole";
import ChangeLocationClient from "./ChangeLocationClient";

export const metadata = {
  title: "Change Location - Activation",
};

export default async function ChangeLocationPage() {
  await requireRole(["admin", "manager"]);

  return <ChangeLocationClient />;
}
