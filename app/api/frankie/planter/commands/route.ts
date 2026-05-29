import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

const VALID_COMMANDS = [
  "set_height_en", "set_sentinel_en", "set_seed_en", "set_vac_en", "ota_update",
  "set_min_speed", "set_seed_delay", "set_vac_delay", "set_sent_delay",
  "set_output_hold", "set_fallback_thresh", "set_sentinel_scale",
  "set_device_name",
] as const;
type PlanterCommand = typeof VALID_COMMANDS[number];

const VALUE_OPTIONAL_COMMANDS: readonly string[] = ["ota_update"];
const BOOLEAN_COMMANDS: readonly string[]  = ["set_height_en", "set_sentinel_en", "set_seed_en", "set_vac_en"];
const NUMERIC_COMMANDS: readonly string[]  = [
  "set_min_speed", "set_seed_delay", "set_vac_delay", "set_sent_delay",
  "set_output_hold", "set_fallback_thresh", "set_sentinel_scale",
];
const STRING_COMMANDS: readonly string[]   = ["set_device_name"];

// POST — dashboard sends a command (authenticated)
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, page_permissions")
      .eq("id", session.user.id)
      .single();

    const role = profile?.role ?? "user";
    const pagePermissions = (profile?.page_permissions ?? {}) as Record<string, boolean>;

    if (role !== "admin" && !pagePermissions["frankie"] && !pagePermissions["frankie/planter"]) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { command, value, num_value, string_value, device_id = "default" } = body;

    if (!command || !VALID_COMMANDS.includes(command as PlanterCommand)) {
      return NextResponse.json({ error: "Invalid command" }, { status: 400 });
    }
    if (BOOLEAN_COMMANDS.includes(command) && typeof value !== "boolean") {
      return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
    }
    if (NUMERIC_COMMANDS.includes(command) && typeof num_value !== "number") {
      return NextResponse.json({ error: "num_value must be a number" }, { status: 400 });
    }
    if (STRING_COMMANDS.includes(command) && typeof string_value !== "string") {
      return NextResponse.json({ error: "string_value must be a string" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("planter_commands")
      .insert({
        command,
        value:        BOOLEAN_COMMANDS.includes(command) ? value        : null,
        num_value:    NUMERIC_COMMANDS.includes(command) ? num_value    : null,
        string_value: STRING_COMMANDS.includes(command)  ? string_value : null,
        status: "pending",
        sent_by: session.user.id,
        device_id,
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to save command" }, { status: 500 });
    }

    return NextResponse.json({ success: true, command: data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — ESP32 polls for the next pending planter command (unauthenticated, service role)
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();
    const device_id = req.nextUrl.searchParams.get("device_id") ?? "default";

    const { data: command, error } = await supabase
      .from("planter_commands")
      .select("*")
      .eq("device_id", device_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ command: command ?? null });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — ESP32 marks a command as processed (unauthenticated, service role)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const { error } = await supabase
      .from("planter_commands")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to update command" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
