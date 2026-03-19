import NotesClient from "./NotesClient";
import { requireRole } from "../../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotesPage() {
  await requireRole(["admin"]);

  return <NotesClient />;
}
