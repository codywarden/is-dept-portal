import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (key) {
      const { data, error } = await supabase
        .from("sa_app_settings")
        .select("key, value")
        .eq("key", key)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
      }
      return NextResponse.json({ data: data ? [data] : [] });
    }

    const { data, error } = await supabase
      .from("sa_app_settings")
      .select("key, value")
      .order("key", { ascending: true });
    if (error) {
      return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}
