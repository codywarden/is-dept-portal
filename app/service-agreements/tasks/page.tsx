import TasksClient from "./TasksClient";
import { requireUser } from "../../lib/auth/requireRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = "admin" | "manager" | "user" | "guest";

export default async function TasksPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "user") as Role;

  return <TasksClient role={role} />;
}
