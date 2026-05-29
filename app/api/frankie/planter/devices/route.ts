import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("planter_status")
      .select("id, last_seen, firmware_version")
      .order("last_seen", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const devices = (data ?? []).map((row) => {
      const secondsSince = row.last_seen
        ? (Date.now() - new Date(row.last_seen).getTime()) / 1000
        : Infinity;
      return {
        id: row.id,
        label: row.id === "default" ? "Production" : row.id.charAt(0).toUpperCase() + row.id.slice(1),
        online: secondsSince < 90,
        last_seen: row.last_seen,
        firmware_version: row.firmware_version,
      };
    });

    return NextResponse.json(devices);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
