import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

const BATCH = 1000;

async function sumByLocation(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  table: "sa_subscription_cost_items" | "sa_subscription_sold_items",
  amountCol: "amount" | "retail_price"
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`location, ${amountCol}`)
      .range(from, from + BATCH - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const loc = (row.location ?? "Unassigned").trim() || "Unassigned";
      const val = Number((row as Record<string, unknown>)[amountCol] ?? 0);
      map[loc] = (map[loc] ?? 0) + (Number.isFinite(val) ? val : 0);
    }

    if (data.length < BATCH) break;
    from += BATCH;
  }

  return map;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [costByLocation, soldByLocation] = await Promise.all([
      sumByLocation(supabase, "sa_subscription_cost_items", "amount"),
      sumByLocation(supabase, "sa_subscription_sold_items", "retail_price"),
    ]);

    return NextResponse.json({ costByLocation, soldByLocation });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
