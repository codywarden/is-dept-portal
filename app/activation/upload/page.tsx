import UploadClient from "./UploadClient";
import { requireUser } from "../../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UploadPage() {
  await requireUser();

  return <UploadClient />;
}
