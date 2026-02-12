import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, location")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "viewer";
    const userLocation = profile?.location ?? null;

    if (id) {
      const { data, error } = await supabase.from("sa_customers").select("*").eq("id", id).single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data });
    }

    let q = supabase.from("sa_customers").select("*").order("created_at", { ascending: false });
    if (role !== "admin") {
      if (!userLocation) return NextResponse.json({ data: [] });
      q = q.eq("location", userLocation);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const payload = {
      name: body.name,
      email: body.email ?? null,
      location: body.location ?? null,
      level: body.level ?? "Remote",
      created_by: user.id,
    };

    const { data, error } = await supabase.from("sa_customers").insert([payload]).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data?.[0] ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id, patch } = body;
    if (!id || !patch) return NextResponse.json({ error: "id and patch required" }, { status: 400 });

    const { data, error } = await supabase.from("sa_customers").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await supabase.from("sa_customers").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
