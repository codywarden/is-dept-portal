import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

type Role = "admin" | "manager" | "user" | "guest";

async function getUserRole() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { supabase, user: null, role: null as null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  return {
    supabase,
    user: authData.user,
    role: (profile?.role ?? "user") as Role,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user, role } = await getUserRole();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (role !== "admin") {
      return NextResponse.json({ error: "Only admins can view reprint files" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const { data, error } = await supabase
        .from("sa_location_change_print_files")
        .select("id, title, request_count, request_ids, html_content, created_at")
        .eq("id", id)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ file: data });
    }

    const { data, error } = await supabase
      .from("sa_location_change_print_files")
      .select("id, title, request_count, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ files: data ?? [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, role } = await getUserRole();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (role !== "admin") {
      return NextResponse.json({ error: "Only admins can save reprint files" }, { status: 403 });
    }

    const body = await req.json();
    const title = String(body?.title ?? "Approved Location Changes").trim();
    const htmlContent = String(body?.htmlContent ?? "");
    const requestCount = Number(body?.requestCount ?? 0);
    const requestIds = Array.isArray(body?.requestIds)
      ? body.requestIds.filter((id: unknown) => typeof id === "string")
      : [];

    if (!htmlContent) {
      return NextResponse.json({ error: "htmlContent is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("sa_location_change_print_files")
      .insert({
        title: title || "Approved Location Changes",
        html_content: htmlContent,
        request_count: Number.isFinite(requestCount) ? requestCount : requestIds.length,
        request_ids: requestIds,
        created_by: user.id,
      })
      .select("id, title, request_count, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ file: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
