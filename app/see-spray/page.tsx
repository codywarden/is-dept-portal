import { requireUser } from "../lib/auth/requireRole";
import SeeSprayClient from "./SeeSprayClient";

export default async function SeeSprayPage() {
  await requireUser();
  return <SeeSprayClient />;
}
