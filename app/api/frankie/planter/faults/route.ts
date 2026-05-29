import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();
    const device_id = req.nextUrl.searchParams.get("device_id") ?? "default";

    const { data, error } = await supabase
      .from("planter_fault_log")
      .select("*")
      .eq("device_id", device_id)
      .order("occurred_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
