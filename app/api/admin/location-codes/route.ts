import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/app/lib/supabase/server";

const getClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from("sa_location_codes")
      .select("id, code, location_name, created_at")
      .order("code", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch location codes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { code, location_name } = await req.json();
    if (!code || !location_name) {
      return NextResponse.json({ error: "code and location_name are required" }, { status: 400 });
    }

    const supabase = getClient();
    const { data, error } = await supabase
      .from("sa_location_codes")
      .insert({ code: String(code).trim().toUpperCase(), location_name: String(location_name).trim() })
      .select("id, code, location_name")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add location code" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id, code } = await req.json();
    if (!id && !code) return NextResponse.json({ error: "id or code required" }, { status: 400 });

    const supabase = getClient();
    const q = supabase.from("sa_location_codes").delete();
    if (id) q.eq("id", id);
    else q.eq("code", String(code).trim().toUpperCase());

    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete location code" }, { status: 500 });
  }
}