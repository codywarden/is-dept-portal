import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const customer_id = url.searchParams.get("customer_id");
    const location = url.searchParams.get("location");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, location")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "viewer";
    const userLocation = profile?.location ?? null;

    if (role !== "admin" && !userLocation) {
      return NextResponse.json({ data: [] });
    }

    let q = supabase.from("sa_tasks").select("*").order("created_at", { ascending: false });
    if (customer_id) q = q.eq("customer_id", customer_id);

    if (role !== "admin") {
      const { data: customers } = await supabase
        .from("sa_customers")
        .select("id")
        .eq("location", userLocation);

      const ids = (customers ?? []).map((c) => c.id);
      if (ids.length === 0) return NextResponse.json({ data: [] });
      q = q.in("customer_id", ids);
    } else if (location) {
      const { data: customers } = await supabase
        .from("sa_customers")
        .select("id")
        .eq("location", location);

      const ids = (customers ?? []).map((c) => c.id);
      if (ids.length === 0) return NextResponse.json({ data: [] });
      q = q.in("customer_id", ids);
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
      customer_id: body.customer_id ?? null,
      title: body.title,
      due_date: body.due_date ?? null,
      status: body.status ?? "not_started",
      created_by: user.id,
    };

    const { data, error } = await supabase.from("sa_tasks").insert([payload]).select();
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

    const { data, error } = await supabase.from("sa_tasks").update(patch).eq("id", id).select().single();
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

    const { error } = await supabase.from("sa_tasks").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
