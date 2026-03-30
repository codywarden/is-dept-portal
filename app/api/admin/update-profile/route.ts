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
  const patch = body?.patch as {
    first_name?: string;
    last_name?: string;
    email?: string;
    location?: string;
    locations?: string[];
    page_permissions?: Record<string, boolean>;
    cell_phone?: string;
  };

  if (!userId || !patch || typeof patch !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // service role does the update (avoids any RLS surprises)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const updatePayload: Record<string, unknown> = {};
  if ("first_name" in patch) updatePayload.first_name = patch.first_name ?? null;
  if ("last_name" in patch) updatePayload.last_name = patch.last_name ?? null;
  if ("locations" in patch) {
    updatePayload.locations = patch.locations ?? [];
    updatePayload.location = patch.locations?.[0] ?? null;
  }
  if ("location" in patch) updatePayload.location = patch.location ?? null;
  if ("page_permissions" in patch) updatePayload.page_permissions = patch.page_permissions ?? null;
  if ("cell_phone" in patch) updatePayload.cell_phone = patch.cell_phone ?? null;

  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (patch.email) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: patch.email,
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
