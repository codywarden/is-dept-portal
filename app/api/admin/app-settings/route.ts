import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/app/lib/supabase/server";

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function requireAdmin() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service role environment variables");
  }

  return createClient(url, key);
}

export async function GET(req: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = createServiceClient();
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

export async function POST(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = (await req.json()) as { key?: string; value?: string };
    const key = body.key?.trim();
    const value = body.value?.trim() ?? "";

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("sa_app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: "Failed to save setting" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
