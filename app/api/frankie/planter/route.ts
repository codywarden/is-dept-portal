import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

// GET — dashboard fetches latest planter status
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();
    const device_id = req.nextUrl.searchParams.get("device_id") ?? "default";

    const { data, error } = await supabase
      .from("planter_status")
      .select("*")
      .eq("id", device_id)
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
      device_id = "default",
      device_name,
      firmware_version, ip_address, wifi_ssid,
      speed_mph, armed, height, output_on, output_reason,
      seed_fault, seed_fault_row, vac_fault,
      sentinel_alarm, sentinel_target_gal, sentinel_avg_gal,
      live_thresh, sentinel_en, seed_en, vac_en, height_en,
      cfg_min_speed, cfg_seed_delay, cfg_vac_delay, cfg_sent_delay,
      cfg_output_hold, cfg_fallback_thresh, cfg_sentinel_scale,
      trips,
    } = body;

    // Check previous fault state to detect newly triggered faults
    const { data: prev } = await supabase
      .from("planter_status")
      .select("output_on, seed_fault, vac_fault, sentinel_alarm")
      .eq("id", device_id)
      .single();

    const newFault =
      (output_on    && !prev?.output_on)    ||
      (seed_fault   && !prev?.seed_fault)   ||
      (vac_fault    && !prev?.vac_fault)    ||
      (sentinel_alarm && !prev?.sentinel_alarm);

    if (newFault) {
      await supabase.from("planter_fault_log").insert({
        device_id,
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
        id: device_id,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        firmware_version, ip_address, wifi_ssid,
        speed_mph, armed, height, output_on, output_reason,
        seed_fault, seed_fault_row, vac_fault,
        sentinel_alarm, sentinel_target_gal, sentinel_avg_gal,
        live_thresh, sentinel_en, seed_en, vac_en, height_en,
        cfg_min_speed, cfg_seed_delay, cfg_vac_delay, cfg_sent_delay,
        cfg_output_hold, cfg_fallback_thresh, cfg_sentinel_scale,
      }, { onConflict: "id" });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    // Save any new actual 12V relay fires from the device trip log.
    // The device sends last 10 trips on every POST; the UNIQUE index on
    // (device_id, device_uptime) silently drops duplicates.
    if (Array.isArray(trips) && trips.length > 0) {
      const rows = trips
        .filter((t: unknown) => t && typeof t === "object" && (t as Record<string, unknown>).uptime)
        .map((t: { uptime: string; reason?: string }) => ({
          device_id,
          device_uptime: t.uptime,
          reason: t.reason ?? null,
        }));
      if (rows.length > 0) {
        await supabase
          .from("planter_trip_log")
          .upsert(rows, { onConflict: "device_id,device_uptime", ignoreDuplicates: true });
      }
    }

    // Upsert board record — keep any dashboard-assigned name unless the board
    // is reporting a name for the first time (no existing name in DB)
    const { data: existingDevice } = await supabase
      .from("planter_devices")
      .select("name")
      .eq("id", device_id)
      .single();

    const nameToStore = existingDevice?.name ?? device_name ?? null;
    await supabase
      .from("planter_devices")
      .upsert({ id: device_id, name: nameToStore, updated_at: new Date().toISOString() }, { onConflict: "id" });

    // Deliver next pending command in the telemetry response so the ESP32
    // doesn't need a separate polling loop
    const { data: command } = await supabase
      .from("planter_commands")
      .select("id, command, value, num_value, string_value")
      .eq("device_id", device_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    // Return the authoritative device_name so the board can sync its local name
    const authoritative_name = nameToStore;

    return NextResponse.json({ success: true, command: command ?? null, device_name: authoritative_name });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
