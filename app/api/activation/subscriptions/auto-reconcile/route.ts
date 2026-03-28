import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "../../../../lib/supabase/server";

const AUTO_RECONCILE_DAYS_KEY = "auto_reconcile_days";
const DEFAULT_AUTO_RECONCILE_DAYS = 60;

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

async function getUserRole() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { user: null, role: null as null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  return {
    user: authData.user,
    role: (profile?.role ?? "viewer") as "admin" | "verifier" | "viewer",
  };
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return Math.abs((da - db) / (1000 * 60 * 60 * 24));
}

export async function POST() {
  try {
    const { user, role } = await getUserRole();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (role !== "admin" && role !== "verifier") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();

    // Fetch the configured day-spread window
    const { data: settingRows } = await supabase
      .from("sa_app_settings")
      .select("value")
      .eq("key", AUTO_RECONCILE_DAYS_KEY)
      .maybeSingle();
    const maxDays =
      settingRows?.value ? Number(settingRows.value) : DEFAULT_AUTO_RECONCILE_DAYS;

    // Fetch all unreconciled cost items
    const { data: costItems, error: costError } = await supabase
      .from("sa_subscription_cost_items")
      .select("id, serial_number, contract_start, location")
      .is("matched_sold_item_id", null);

    if (costError) return NextResponse.json({ error: costError.message }, { status: 500 });

    // Fetch all unreconciled sold items
    const { data: soldItems, error: soldError } = await supabase
      .from("sa_subscription_sold_items")
      .select("id, serial_number, invoice_date, location")
      .is("matched_cost_item_id", null);

    if (soldError) return NextResponse.json({ error: soldError.message }, { status: 500 });

    // Group sold items by normalized serial number for fast lookup
    const soldBySn = new Map<string, typeof soldItems>();
    for (const sold of soldItems ?? []) {
      const sn = normalize(sold.serial_number);
      if (!sn) continue;
      if (!soldBySn.has(sn)) soldBySn.set(sn, []);
      soldBySn.get(sn)!.push(sold);
    }

    // Track which sold items have been matched in this run
    const usedSoldIds = new Set<string>();
    const matches: { costId: string; soldId: string }[] = [];

    for (const cost of costItems ?? []) {
      const sn = normalize(cost.serial_number);
      if (!sn) continue;

      const candidates = soldBySn.get(sn) ?? [];
      for (const sold of candidates) {
        if (usedSoldIds.has(sold.id)) continue;

        // Check location
        if (normalize(cost.location) !== normalize(sold.location)) continue;

        // Check date spread
        const diff = daysBetween(cost.contract_start, sold.invoice_date);
        if (diff === null || diff > maxDays) continue;

        // All three criteria met — take this match
        matches.push({ costId: cost.id, soldId: sold.id });
        usedSoldIds.add(sold.id);
        break;
      }
    }

    if (matches.length === 0) {
      return NextResponse.json({ matched: 0 });
    }

    // Apply all matches
    for (const { costId, soldId } of matches) {
      await supabase
        .from("sa_subscription_cost_items")
        .update({ matched_sold_item_id: soldId, auto_reconclied: true })
        .eq("id", costId)
        .is("matched_sold_item_id", null);

      await supabase
        .from("sa_subscription_sold_items")
        .update({ matched_cost_item_id: costId, auto_reconclied: true })
        .eq("id", soldId)
        .is("matched_cost_item_id", null);
    }

    return NextResponse.json({ matched: matches.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
