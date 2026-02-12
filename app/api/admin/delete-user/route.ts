import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
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
      // supabase-js admin delete API
      // @ts-ignore
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
