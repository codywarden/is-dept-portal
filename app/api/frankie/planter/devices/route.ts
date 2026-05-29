import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

// GET — list all known boards with live status and saved name/location
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();

    const [{ data: statusRows }, { data: deviceRows }] = await Promise.all([
      supabase.from("planter_status").select("id, last_seen, firmware_version, ip_address, wifi_ssid"),
      supabase.from("planter_devices").select("id, name, location, notes"),
    ]);

    // Merge: all boards that have ever posted telemetry
    const deviceMap = Object.fromEntries((deviceRows ?? []).map(d => [d.id, d]));

    const devices = (statusRows ?? []).map((row) => {
      const secondsSince = row.last_seen
        ? (Date.now() - new Date(row.last_seen).getTime()) / 1000
        : Infinity;
      const saved = deviceMap[row.id];
      return {
        id: row.id,
        name: saved?.name ?? null,
        location: saved?.location ?? null,
        notes: saved?.notes ?? null,
        online: secondsSince < 90,
        last_seen: row.last_seen,
        firmware_version: row.firmware_version,
        ip_address: row.ip_address,
        wifi_ssid: row.wifi_ssid,
      };
    });

    // Sort: online first, then by last_seen descending
    devices.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (!a.last_seen) return 1;
      if (!b.last_seen) return -1;
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
    });

    return NextResponse.json(devices);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — save name/location/notes for a board (authenticated, requires frankie_planter_boards permission)
export async function PATCH(req: NextRequest) {
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
    const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;

    if (role !== "admin" && !perms["frankie_planter_boards"]) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { id, name, location, notes } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing device id" }, { status: 400 });

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("planter_devices")
      .upsert({ id, name: name ?? null, location: location ?? null, notes: notes ?? null, updated_at: new Date().toISOString() }, { onConflict: "id" });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
