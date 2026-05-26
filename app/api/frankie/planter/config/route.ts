import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

const NUMERIC_COMMANDS = [
  "set_min_speed", "set_seed_delay", "set_vac_delay", "set_sent_delay",
  "set_output_hold", "set_fallback_thresh", "set_sentinel_scale",
] as const;

// GET — return the last-sent value for each numeric config command
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("planter_commands")
      .select("command, num_value, created_at")
      .in("command", NUMERIC_COMMANDS)
      .not("num_value", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Keep only the most recent entry per command
    const latest: Record<string, number> = {};
    for (const row of data ?? []) {
      if (!(row.command in latest)) {
        latest[row.command] = row.num_value;
      }
    }

    return NextResponse.json(latest);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
