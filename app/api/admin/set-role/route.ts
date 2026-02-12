import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

type Role = "admin" | "verifier" | "viewer";

const BOOTSTRAP_ADMIN_ID = "d57eec62-d15d-4e06-90fd-7bacb05d4a77";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (userData.user.id !== BOOTSTRAP_ADMIN_ID) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const userId = body?.userId as string;
  const role = body?.role as Role;

  if (!userId || !["admin", "verifier", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
