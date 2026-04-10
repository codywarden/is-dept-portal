import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/app/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // Auth check — admin only
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin" && profile?.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Attempt to delete auth user (ignore error if not found)
    try {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) {
        console.warn("Auth delete error (ignored if user missing):", delErr.message);
      }
    } catch (e) {
      console.warn("Auth delete threw (ignored):", e);
    }

    // Delete profile row
    const { error: profileErr } = await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("delete-user error:", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
