import ActivationClient from "./ActivationClient";
import { requireUser } from "../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ActivationPage() {
  await requireUser();

  return <ActivationClient />;
}
