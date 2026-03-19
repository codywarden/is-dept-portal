import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

type SummaryBucket = {
  location: string;
  costTotal: number;
  retailTotal: number;
  marginAmount: number;
  marginPercent: number | null;
};

const BATCH_SIZE = 1000;
const NOT_RECONCLIED_YET_LABEL = "Not Reconclied Yet";

function normalizeLocation(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : "Unassigned";
}

async function getAllCostRows(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const rows: { location: string | null; amount: number | null; matched_sold_item_id: string | null }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sa_subscription_cost_items")
      .select("location, amount, matched_sold_item_id")
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < BATCH_SIZE) {
      break;
    }

    from += BATCH_SIZE;
  }

  return rows;
}

async function getAllSoldRows(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const rows: { location: string | null; retail_price: number | null; matched_cost_item_id: string | null }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sa_subscription_sold_items")
      .select("location, retail_price, matched_cost_item_id")
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < BATCH_SIZE) {
      break;
    }

    from += BATCH_SIZE;
  }

  return rows;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [costRows, soldRows] = await Promise.all([
      getAllCostRows(supabase),
      getAllSoldRows(supabase),
    ]);

    const bucketMap = new Map<string, { costTotal: number; retailTotal: number }>();

    let notReconcliedCostTotal = 0;
    let notReconcliedRetailTotal = 0;

    for (const row of costRows) {
      const amount = Number(row.amount ?? 0);
      const safeAmount = Number.isFinite(amount) ? amount : 0;

      if (!row.matched_sold_item_id) {
        notReconcliedCostTotal += safeAmount;
        continue;
      }

      const location = normalizeLocation(row.location);
      const current = bucketMap.get(location) ?? { costTotal: 0, retailTotal: 0 };
      current.costTotal += safeAmount;
      bucketMap.set(location, current);
    }

    for (const row of soldRows) {
      const retail = Number(row.retail_price ?? 0);
      const safeRetail = Number.isFinite(retail) ? retail : 0;

      if (!row.matched_cost_item_id) {
        notReconcliedRetailTotal += safeRetail;
        continue;
      }

      const location = normalizeLocation(row.location);
      const current = bucketMap.get(location) ?? { costTotal: 0, retailTotal: 0 };
      current.retailTotal += safeRetail;
      bucketMap.set(location, current);
    }

    bucketMap.set(NOT_RECONCLIED_YET_LABEL, {
      costTotal: notReconcliedCostTotal,
      retailTotal: notReconcliedRetailTotal,
    });

    const rows: SummaryBucket[] = Array.from(bucketMap.entries())
      .map(([location, totals]) => {
        const marginAmount = totals.retailTotal - totals.costTotal;
        const marginPercent = totals.retailTotal > 0 ? (marginAmount / totals.retailTotal) * 100 : null;
        return {
          location,
          costTotal: totals.costTotal,
          retailTotal: totals.retailTotal,
          marginAmount,
          marginPercent,
        };
      })
      .sort((a, b) => {
        if (a.location === NOT_RECONCLIED_YET_LABEL) return 1;
        if (b.location === NOT_RECONCLIED_YET_LABEL) return -1;
        return a.location.localeCompare(b.location);
      });

    const totals = rows.reduce(
      (acc, row) => {
        acc.costTotal += row.costTotal;
        acc.retailTotal += row.retailTotal;
        return acc;
      },
      { costTotal: 0, retailTotal: 0 },
    );

    const totalMarginAmount = totals.retailTotal - totals.costTotal;
    const totalMarginPercent = totals.retailTotal > 0 ? (totalMarginAmount / totals.retailTotal) * 100 : null;

    return NextResponse.json({
      rows,
      totals: {
        ...totals,
        marginAmount: totalMarginAmount,
        marginPercent: totalMarginPercent,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
