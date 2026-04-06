import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// GET endpoint for dashboard to fetch ESP32 status
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return (async () => (await cookies()).getAll())();
          },
          setAll(cookiesToSet) {
            // No-op for GET
          },
        },
      }
    );

    // Get ESP32 status
    const { data: status, error } = await supabase
      .from("frankie_status")
      .select("*")
      .eq("esp32_device_id", "default")
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // If no status record exists, ESP32 is offline
    if (!status) {
      return NextResponse.json({
        status: "offline",
        last_seen: null,
        message: "ESP32 not connected"
      });
    }

    // Check if ESP32 is online (last seen within 90 seconds - allows for 60s heartbeat + buffer)
    const lastSeen = new Date(status.last_seen);
    const now = new Date();
    const secondsSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000;
    const isOnline = secondsSinceLastSeen < 90;

    return NextResponse.json({
      status: isOnline ? "online" : "offline",
      last_seen: status.last_seen,
      ip_address: status.ip_address,
      wifi_ssid: status.wifi_ssid,
      firmware_version: status.firmware_version,
      seconds_since_last_seen: Math.round(secondsSinceLastSeen)
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST endpoint for ESP32 heartbeat
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return (async () => (await cookies()).getAll())();
          },
          setAll(cookiesToSet) {
            // No-op for POST
          },
        },
      }
    );

    const body = await req.json();
    const { ip_address, wifi_ssid, firmware_version } = body;

    // Upsert ESP32 status
    const { data, error } = await supabase
      .from("frankie_status")
      .upsert({
        esp32_device_id: "default",
        status: "online",
        last_seen: new Date().toISOString(),
        ip_address: ip_address || null,
        wifi_ssid: wifi_ssid || null,
        firmware_version: firmware_version || "1.0.0",
        updated_at: new Date().toISOString()
      }, {
        onConflict: "esp32_device_id"
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}