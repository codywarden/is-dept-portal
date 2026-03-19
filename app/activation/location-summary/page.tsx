import { requireUser } from "../../lib/auth/requireRole";
import LocationSummaryClient from "./LocationSummaryClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LocationSummaryPage() {
  await requireUser();
  return <LocationSummaryClient />;
}
