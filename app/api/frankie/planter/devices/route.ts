import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

async function getSessionAndProfile() {
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
  if (!session) return { session: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, page_permissions")
    .eq("id", session.user.id)
    .single();

  return { session, profile };
}

// GET — list boards the current user has access to
export async function GET() {
  try {
    const { session, profile } = await getSessionAndProfile();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = profile?.role ?? "user";
    const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;
    const canSeeAll =
      role === "admin" ||
      role === "manager" ||
      !!perms["frankie_planter_boards_manage"];

    const admin = createSupabaseAdmin();
    const [{ data: statusRows }, { data: deviceRows }] = await Promise.all([
      admin.from("planter_status").select("id, last_seen, firmware_version, ip_address, wifi_ssid"),
      admin.from("planter_devices").select("id, name, location, notes, allowed_users"),
    ]);

    const deviceMap = Object.fromEntries((deviceRows ?? []).map(d => [d.id, d]));
    const userId = session.user.id;

    const devices = (statusRows ?? [])
      .map((row) => {
        const saved = deviceMap[row.id];
        const allowedUsers: string[] | null = saved?.allowed_users ?? null;

        // Admins/managers/board-managers see everything; others only see their assigned boards
        const hasAccess =
          canSeeAll ||
          !allowedUsers ||
          allowedUsers.length === 0 ||
          allowedUsers.includes(userId);

        if (!hasAccess) return null;

        const secondsSince = row.last_seen
          ? (Date.now() - new Date(row.last_seen).getTime()) / 1000
          : Infinity;

        return {
          id: row.id,
          name: saved?.name ?? null,
          location: saved?.location ?? null,
          notes: saved?.notes ?? null,
          allowed_users: saved?.allowed_users ?? null,
          online: secondsSince < 90,
          last_seen: row.last_seen,
          firmware_version: row.firmware_version,
          ip_address: row.ip_address,
          wifi_ssid: row.wifi_ssid,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

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

// PATCH — save name/location/notes/allowed_users for a board
export async function PATCH(req: NextRequest) {
  try {
    const { session, profile } = await getSessionAndProfile();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = profile?.role ?? "user";
    const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;

    if (role !== "admin" && !perms["frankie_planter_boards"]) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { id, name, location, notes, allowed_users } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing device id" }, { status: 400 });

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("planter_devices")
      .upsert(
        {
          id,
          name: name ?? null,
          location: location ?? null,
          notes: notes ?? null,
          allowed_users: Array.isArray(allowed_users) && allowed_users.length > 0 ? allowed_users : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

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

// DELETE — remove a board from the system (requires frankie_planter_boards_delete)
export async function DELETE(req: NextRequest) {
  try {
    const { session, profile } = await getSessionAndProfile();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = profile?.role ?? "user";
    const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;

    if (role !== "admin" && !perms["frankie_planter_boards_delete"]) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing device id" }, { status: 400 });

    const admin = createSupabaseAdmin();
    await Promise.all([
      admin.from("planter_devices").delete().eq("id", id),
      admin.from("planter_status").delete().eq("id", id),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
