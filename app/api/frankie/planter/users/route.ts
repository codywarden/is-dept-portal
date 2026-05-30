import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

// GET — list users for the board access picker (requires admin or frankie_planter_boards_manage)
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, page_permissions")
      .eq("id", session.user.id)
      .single();

    const role = profile?.role ?? "user";
    const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;

    if (role !== "admin" && role !== "manager" && !perms["frankie_planter_boards_manage"]) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const admin = createSupabaseAdmin();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .order("first_name", { ascending: true });

    const users = (profiles ?? []).map(p => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id,
      email: p.email ?? null,
    }));

    return NextResponse.json(users);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
