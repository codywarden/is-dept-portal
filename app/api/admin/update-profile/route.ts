import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "verifier" | "viewer";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: caller } = await supabase.auth.getUser();

  if (!caller.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // confirm caller is admin
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .single();

  const myRole = (myProfile?.role ?? "viewer") as Role;
  if (myRole !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const userId = body?.userId as string;
  const patch = body?.patch as { first_name?: string; last_name?: string; location?: string };

  if (!userId || !patch || typeof patch !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // service role does the update (avoids any RLS surprises)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      first_name: patch.first_name ?? null,
      last_name: patch.last_name ?? null,
      location: patch.location ?? null,
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
