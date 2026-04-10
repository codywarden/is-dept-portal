import { requireRole } from "../../../lib/auth/requireRole";
import FilesClient from "./FilesClient";

export const metadata = {
  title: "Location Reprint Files - Activation",
};

export default async function ChangeLocationFilesPage() {
  await requireRole(["admin", "manager"]);

  return <FilesClient />;
}
