import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";

async function getAuth() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { user: null, role: null as null, email: null as null, canApprove: false };

  const db = createSupabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("role, page_permissions")
    .eq("id", authData.user.id)
    .single();

  const role = (profile?.role ?? "user") as "admin" | "manager" | "user" | "guest";
  const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;
  const canApprove = role === "admin" || role === "manager" || perms["activation/reconcile-approve"] === true;

  return {
    user: authData.user,
    role,
    email: authData.user.email ?? null,
    canApprove,
  };
}

export async function GET() {
  try {
    const { user } = await getAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = createSupabaseAdmin();
    const { data, error } = await db
      .from("sa_cost_absorption_overrides")
      .select(`
        *,
        cost_item:sa_subscription_cost_items(customer_name, serial_number, item_number, invoice_number, location)
      `)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Flatten cost item fields into the override object
    const overrides = (data ?? []).map(({ cost_item, ...o }) => ({
      ...o,
      customer_name: (cost_item as { customer_name?: string | null } | null)?.customer_name ?? null,
      serial_number: (cost_item as { serial_number?: string | null } | null)?.serial_number ?? null,
      item_number: (cost_item as { item_number?: string | null } | null)?.item_number ?? null,
      invoice_number: (cost_item as { invoice_number?: string | null } | null)?.invoice_number ?? null,
      location: (cost_item as { location?: string | null } | null)?.location ?? null,
    }));

    return NextResponse.json({ overrides });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, canApprove, email } = await getAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = createSupabaseAdmin();
    const body = await req.json();
    const { action } = body ?? {};

    if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

    // --- CREATE ---
    if (action === "create") {
      const { costItemId, overridePersonName, reason } = body;
      if (!costItemId || !overridePersonName?.trim() || !reason?.trim()) {
        return NextResponse.json({ error: "costItemId, overridePersonName, and reason are required" }, { status: 400 });
      }

      const { data: costItem, error: ciErr } = await db
        .from("sa_subscription_cost_items")
        .select("id, amount, matched_sold_item_id")
        .eq("id", costItemId)
        .single();

      if (ciErr || !costItem) return NextResponse.json({ error: "Cost item not found" }, { status: 404 });
      if (costItem.matched_sold_item_id) {
        return NextResponse.json({ error: "Cost item is already reconciled" }, { status: 400 });
      }

      // Cancel any prior pending override for this cost item
      await db
        .from("sa_cost_absorption_overrides")
        .update({ status: "cancelled" })
        .eq("cost_item_id", costItemId)
        .eq("status", "pending");

      const { data: override, error: insErr } = await db
        .from("sa_cost_absorption_overrides")
        .insert({
          cost_item_id: costItemId,
          override_person_name: overridePersonName.trim(),
          reason: reason.trim(),
          amount: costItem.amount ?? 0,
          status: "pending",
          requested_by_user_id: user.id,
          requested_by_email: email,
        })
        .select()
        .single();

      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

      return NextResponse.json({ override });
    }

    // --- APPROVE ---
    if (action === "approve") {
      if (!canApprove) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { overrideId } = body;
      if (!overrideId) return NextResponse.json({ error: "overrideId required" }, { status: 400 });

      const { data: override, error: ovErr } = await db
        .from("sa_cost_absorption_overrides")
        .select("*")
        .eq("id", overrideId)
        .single();

      if (ovErr || !override) return NextResponse.json({ error: "Override not found" }, { status: 404 });
      if (override.status !== "pending") {
        return NextResponse.json({ error: "Override is not pending" }, { status: 400 });
      }

      const { data: costItem } = await db
        .from("sa_subscription_cost_items")
        .select("id, location, serial_number, invoice_number, item_number, matched_sold_item_id")
        .eq("id", override.cost_item_id)
        .single();

      if (!costItem) return NextResponse.json({ error: "Cost item not found" }, { status: 404 });
      if (costItem.matched_sold_item_id) {
        return NextResponse.json({ error: "Cost item is already reconciled" }, { status: 400 });
      }

      const { data: soldItem, error: soldErr } = await db
        .from("sa_subscription_sold_items")
        .insert({
          customer_name: override.override_person_name,
          description: `Cost Absorbed: ${override.reason}`,
          retail_price: 0,
          location: costItem.location,
          serial_number: costItem.serial_number,
          invoice_number: costItem.invoice_number,
          item_number: costItem.item_number,
          matched_cost_item_id: override.cost_item_id,
        })
        .select("id")
        .single();

      if (soldErr || !soldItem) {
        return NextResponse.json({ error: soldErr?.message ?? "Failed to create synthetic sold item" }, { status: 400 });
      }

      await db
        .from("sa_subscription_cost_items")
        .update({ matched_sold_item_id: soldItem.id })
        .eq("id", override.cost_item_id);

      const { data: updated, error: updErr } = await db
        .from("sa_cost_absorption_overrides")
        .update({
          status: "approved",
          reviewed_by_user_id: user.id,
          reviewed_by_email: email,
          synthetic_sold_item_id: soldItem.id,
        })
        .eq("id", overrideId)
        .select()
        .single();

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

      return NextResponse.json({ override: updated, syntheticSoldItemId: soldItem.id });
    }

    // --- DENY ---
    if (action === "deny") {
      if (!canApprove) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { overrideId, denialReason } = body;
      if (!overrideId) return NextResponse.json({ error: "overrideId required" }, { status: 400 });

      const { data: override, error: ovErr } = await db
        .from("sa_cost_absorption_overrides")
        .select("id, status")
        .eq("id", overrideId)
        .single();

      if (ovErr || !override) return NextResponse.json({ error: "Override not found" }, { status: 404 });
      if (override.status !== "pending") {
        return NextResponse.json({ error: "Override is not pending" }, { status: 400 });
      }

      const { data: updated, error: updErr } = await db
        .from("sa_cost_absorption_overrides")
        .update({
          status: "denied",
          reviewed_by_user_id: user.id,
          reviewed_by_email: email,
          denial_reason: denialReason?.trim() || null,
        })
        .eq("id", overrideId)
        .select()
        .single();

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

      return NextResponse.json({ override: updated });
    }

    // --- CANCEL (remove/undo) ---
    // Works on any status. If approved, tears down the synthetic sold item and unlinks the cost item.
    if (action === "cancel") {
      if (!canApprove) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { overrideId } = body;
      if (!overrideId) return NextResponse.json({ error: "overrideId required" }, { status: 400 });

      const { data: override, error: ovErr } = await db
        .from("sa_cost_absorption_overrides")
        .select("*")
        .eq("id", overrideId)
        .single();

      if (ovErr || !override) return NextResponse.json({ error: "Override not found" }, { status: 404 });
      if (override.status === "cancelled") {
        return NextResponse.json({ error: "Override is already cancelled" }, { status: 400 });
      }

      // If it was approved, undo the reconcile link and delete the synthetic sold item
      if (override.status === "approved" && override.synthetic_sold_item_id) {
        await db
          .from("sa_subscription_cost_items")
          .update({ matched_sold_item_id: null })
          .eq("id", override.cost_item_id)
          .eq("matched_sold_item_id", override.synthetic_sold_item_id);

        await db
          .from("sa_subscription_sold_items")
          .delete()
          .eq("id", override.synthetic_sold_item_id);
      }

      const { data: updated, error: updErr } = await db
        .from("sa_cost_absorption_overrides")
        .update({ status: "cancelled" })
        .eq("id", overrideId)
        .select()
        .single();

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

      return NextResponse.json({ override: updated });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
