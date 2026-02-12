import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const getClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  try {
    const supabase = getClient();
    const { data, error } = await supabase.from("locations").select("id,name").order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name || !name.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const supabase = getClient();
    const { data, error } = await supabase.from("locations").insert({ name: name.trim() }).select("id,name").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add location" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, name } = await req.json();
    if (!id && !name) return NextResponse.json({ error: "id or name required" }, { status: 400 });

    const supabase = getClient();
    const q = supabase.from("locations").delete();
    if (id) q.eq("id", id);
    else q.eq("name", name);

    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 });
  }
}
