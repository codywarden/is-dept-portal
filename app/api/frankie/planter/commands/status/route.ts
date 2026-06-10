import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

// GET — check status of specific command IDs (authenticated, dashboard use only)
export async function GET(req: NextRequest) {
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

    const idsParam = req.nextUrl.searchParams.get("ids");
    if (!idsParam) return NextResponse.json([]);

    const ids = idsParam.split(",").map(Number).filter(Boolean);
    if (ids.length === 0) return NextResponse.json([]);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("planter_commands")
      .select("id, device_id, status, processed_at")
      .in("id", ids);

    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
