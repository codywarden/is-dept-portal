import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("planter_fault_log")
      .select("*")
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
