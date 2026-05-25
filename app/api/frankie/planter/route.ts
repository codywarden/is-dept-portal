import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

// GET — dashboard fetches latest planter status
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("planter_status")
      .select("*")
      .eq("id", "default")
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ status: "offline", last_seen: null });
    }

    const secondsSinceLastSeen = data.last_seen
      ? (Date.now() - new Date(data.last_seen).getTime()) / 1000
      : Infinity;

    return NextResponse.json({
      ...data,
      status: secondsSinceLastSeen < 90 ? "online" : "offline",
      seconds_since_last_seen: Math.round(secondsSinceLastSeen),
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — ESP32 posts telemetry (unauthenticated, service role key)
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();
    const body = await req.json();

    const {
      firmware_version, ip_address, wifi_ssid,
      speed_mph, armed, height, output_on, output_reason,
      seed_fault, seed_fault_row, vac_fault,
      sentinel_alarm, sentinel_target_gal, sentinel_avg_gal,
      live_thresh, sentinel_en, seed_en, vac_en,
    } = body;

    // Check previous fault state to detect newly triggered faults
    const { data: prev } = await supabase
      .from("planter_status")
      .select("output_on, seed_fault, vac_fault, sentinel_alarm")
      .eq("id", "default")
      .single();

    const newFault =
      (output_on    && !prev?.output_on)    ||
      (seed_fault   && !prev?.seed_fault)   ||
      (vac_fault    && !prev?.vac_fault)    ||
      (sentinel_alarm && !prev?.sentinel_alarm);

    if (newFault) {
      await supabase.from("planter_fault_log").insert({
        occurred_at:    new Date().toISOString(),
        output_on:      output_on      ?? false,
        output_reason:  output_reason  ?? null,
        seed_fault:     seed_fault     ?? false,
        seed_fault_row: seed_fault_row ?? null,
        vac_fault:      vac_fault      ?? false,
        sentinel_alarm: sentinel_alarm ?? false,
      });
    }

    const { error } = await supabase
      .from("planter_status")
      .upsert({
        id: "default",
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        firmware_version, ip_address, wifi_ssid,
        speed_mph, armed, height, output_on, output_reason,
        seed_fault, seed_fault_row, vac_fault,
        sentinel_alarm, sentinel_target_gal, sentinel_avg_gal,
        live_thresh, sentinel_en, seed_en, vac_en,
      }, { onConflict: "id" });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    // Deliver next pending command in the telemetry response so the ESP32
    // doesn't need a separate polling loop
    const { data: command } = await supabase
      .from("planter_commands")
      .select("id, command, value, num_value")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    return NextResponse.json({ success: true, command: command ?? null });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
