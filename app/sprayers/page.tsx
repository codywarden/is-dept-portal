import { requireUser } from "../lib/auth/requireRole";
import SprayersClient from "./SprayersClient";

export default async function SprayersPage() {
  await requireUser();
  return <SprayersClient />;
}


