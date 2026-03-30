export const dynamic = "force-dynamic";
export const revalidate = 0;

import UsersClient from "./UsersClient";
import { requireRole } from "../../lib/auth/requireRole";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "verifier" | "viewer";

type AdminRow = {
  id: string;
  email: string | null;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  locations: string[] | null;
  page_permissions: Record<string, boolean> | null;
  last_login: string | null;
  created_at?: string | null;
  cell_phone?: string | null;
};

type ProfileRow = Omit<AdminRow, "last_login">;

export default async function UsersPage() {
  const { user } = await requireRole(["admin"]);

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: currentProfile } = await supabaseAdmin
    .from("profiles")
    .select("page_permissions")
    .eq("id", user.id)
    .single();

  const currentPerms = (currentProfile?.page_permissions ?? null) as Record<string, boolean> | null;
  const hasAnyPerm = currentPerms && Object.keys(currentPerms).length > 0;
  const canAddUser = !hasAnyPerm || currentPerms["admin/users/add"] === true;
  const canDeleteUser = !hasAnyPerm || currentPerms["admin/users/delete"] === true;

  const { data: profiles, error: profilesErr } = await supabaseAdmin
    .from("profiles")
    .select("id,email,role,first_name,last_name,location,locations,page_permissions,created_at,cell_phone")
    .order("created_at", { ascending: false });

  if (profilesErr) {
    return (
      <main style={{ padding: 24 }}>
        Error loading profiles: {profilesErr.message}
      </main>
    );
  }

  const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });

  if (authErr) {
    return (
      <main style={{ padding: 24 }}>
        Error loading auth users: {authErr.message}
      </main>
    );
  }

  const lastLoginById = new Map<string, string | null>();
  for (const u of authList.users) {
    lastLoginById.set(u.id, u.last_sign_in_at ?? null);
  }

  const rows: AdminRow[] = ((profiles ?? []) as ProfileRow[]).map((p) => ({
    ...p,
    last_login: lastLoginById.get(p.id) ?? null,
  }));

  return <UsersClient initialUsers={rows} canAddUser={canAddUser} canDeleteUser={canDeleteUser} canAssignAdmin={true} />;
}
