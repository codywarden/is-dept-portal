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
  last_login: string | null;
  created_at?: string | null;
};

export default async function UsersPage() {
  await requireRole(["admin"]);

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profiles, error: profilesErr } = await supabaseAdmin
    .from("profiles")
    .select("id,email,role,first_name,last_name,location,created_at")
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

  const rows: AdminRow[] = (profiles ?? []).map((p: AdminRow) => ({
    ...p,
    last_login: lastLoginById.get(p.id) ?? null,
  }));

  return <UsersClient initialUsers={rows} />;
}
