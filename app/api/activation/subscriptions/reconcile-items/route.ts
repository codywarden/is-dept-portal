import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

async function getUserRole() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { supabase, user: null, role: null as null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  return {
    supabase,
    user: authData.user,
    role: (profile?.role ?? "viewer") as "admin" | "verifier" | "viewer",
  };
}

export async function GET() {
  try {
    const { supabase, user } = await getUserRole();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all cost items (filter on client)
    const { data: costItems, error: costError } = await supabase
      .from("sa_subscription_cost_items")
      .select("id, customer_name, serial_number, description, amount, invoice_number, item_number, location, matched_sold_item_id, auto_reconclied, file:sa_subscription_cost_files(upload_number, original_filename)")
      .order("created_at", { ascending: true });

    if (costError) {
      return NextResponse.json({ error: costError.message }, { status: 400 });
    }

    // Get all sold items (filter on client)
    const { data: soldItems, error: soldError } = await supabase
      .from("sa_subscription_sold_items")
      .select("id, customer_name, serial_number, description, retail_price, invoice_number, item_number, location, matched_cost_item_id, auto_reconclied, file:sa_subscription_sold_files(upload_number, original_filename)")
      .order("created_at", { ascending: true });

    if (soldError) {
      return NextResponse.json({ error: soldError.message }, { status: 400 });
    }

    return NextResponse.json({ costItems: costItems ?? [], soldItems: soldItems ?? [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, role } = await getUserRole();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Supported actions:
    // - mark_reconclied
    // - mark_not_reconclied
    const body = await req.json();
    const { action, costItemId, soldItemId } = body ?? {};

    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }

    if (action === "mark_not_reconclied") {
      if (role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (!costItemId && !soldItemId) {
        return NextResponse.json({ error: "costItemId or soldItemId required" }, { status: 400 });
      }

      const costQuery = costItemId
        ? supabase
            .from("sa_subscription_cost_items")
            .select("id, matched_sold_item_id")
            .eq("id", costItemId)
            .single()
        : supabase
            .from("sa_subscription_cost_items")
            .select("id, matched_sold_item_id")
            .eq("matched_sold_item_id", soldItemId)
            .single();

      const { data: costItem } = await costQuery;

      if (!costItem) {
        return NextResponse.json({ error: "Reconclied link not found" }, { status: 404 });
      }

      const costUpdate = await supabase
        .from("sa_subscription_cost_items")
        .update({ matched_sold_item_id: null, auto_reconclied: false })
        .eq("id", costItem.id);

      if (costUpdate.error) {
        return NextResponse.json({ error: costUpdate.error.message }, { status: 400 });
      }

      if (costItem.matched_sold_item_id) {
        const soldUpdate = await supabase
          .from("sa_subscription_sold_items")
          .update({ matched_cost_item_id: null, auto_reconclied: false })
          .eq("id", costItem.matched_sold_item_id);

        if (soldUpdate.error) {
          return NextResponse.json({ error: soldUpdate.error.message }, { status: 400 });
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action !== "mark_reconclied") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    if (!costItemId || !soldItemId) {
      return NextResponse.json({ error: "costItemId and soldItemId required" }, { status: 400 });
    }

    // Verify both items exist and are not already matched
    const { data: costItem } = await supabase
      .from("sa_subscription_cost_items")
      .select("id, matched_sold_item_id")
      .eq("id", costItemId)
      .single();

    const { data: soldItem } = await supabase
      .from("sa_subscription_sold_items")
      .select("id, matched_cost_item_id")
      .eq("id", soldItemId)
      .single();

    if (!costItem || !soldItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (costItem.matched_sold_item_id || soldItem.matched_cost_item_id) {
      return NextResponse.json({ error: "One of the items is already Reconclied" }, { status: 400 });
    }

    // Update cost item with sold item reference
    const costUpdate = await supabase
      .from("sa_subscription_cost_items")
      .update({ matched_sold_item_id: soldItemId })
      .eq("id", costItemId)
      .is("matched_sold_item_id", null)
      .select("id")
      .maybeSingle();

    if (costUpdate.error) {
      return NextResponse.json({ error: costUpdate.error.message }, { status: 400 });
    }

    if (!costUpdate.data) {
      return NextResponse.json({ error: "Cost item is already Reconclied" }, { status: 400 });
    }

    // Update sold item with cost item reference
    const soldUpdate = await supabase
      .from("sa_subscription_sold_items")
      .update({ matched_cost_item_id: costItemId })
      .eq("id", soldItemId)
      .is("matched_cost_item_id", null)
      .select("id")
      .maybeSingle();

    if (soldUpdate.error) {
      // Rollback cost item update
      await supabase
        .from("sa_subscription_cost_items")
        .update({ matched_sold_item_id: null })
        .eq("id", costItemId)
        .eq("matched_sold_item_id", soldItemId);
      
      return NextResponse.json({ error: soldUpdate.error.message }, { status: 400 });
    }

    if (!soldUpdate.data) {
      await supabase
        .from("sa_subscription_cost_items")
        .update({ matched_sold_item_id: null })
        .eq("id", costItemId)
        .eq("matched_sold_item_id", soldItemId);

      return NextResponse.json({ error: "Sold item is already Reconclied" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
