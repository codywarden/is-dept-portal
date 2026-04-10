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
    role: (profile?.role ?? "user") as "admin" | "manager" | "user" | "guest",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getUserRole();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const costItemId = searchParams.get("costItemId");

    // Get all location change requests
    let baseQuery = supabase
      .from("sa_location_change_requests")
      .select("*");

    // If costItemId provided, get just that item's request
    if (costItemId) {
      baseQuery = baseQuery.eq("cost_item_id", costItemId);
    }

    const { data: requests, error } = await baseQuery.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const requestRows = requests || [];
    const costItemIds = Array.from(
      new Set(
        requestRows
          .map((r) => r.cost_item_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const soldItemIds = Array.from(
      new Set(
        requestRows
          .map((r) => r.sold_item_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    let costItemMap = new Map<string, { invoice_number: string | null; order_number: string | null }>();
    if (costItemIds.length > 0) {
      const { data: costItems, error: costItemsError } = await supabase
        .from("sa_subscription_cost_items")
        .select("id, invoice_number, order_number")
        .in("id", costItemIds);

      if (costItemsError) {
        return NextResponse.json({ error: costItemsError.message }, { status: 400 });
      }

      costItemMap = new Map(
        (costItems || []).map((item) => [
          item.id,
          {
            invoice_number: item.invoice_number ?? null,
            order_number: item.order_number ?? null,
          },
        ])
      );
    }

    let soldItemMap = new Map<string, { invoice_number: string | null }>();
    if (soldItemIds.length > 0) {
      const { data: soldItems, error: soldItemsError } = await supabase
        .from("sa_subscription_sold_items")
        .select("id, invoice_number")
        .in("id", soldItemIds);

      if (soldItemsError) {
        return NextResponse.json({ error: soldItemsError.message }, { status: 400 });
      }

      soldItemMap = new Map(
        (soldItems || []).map((item) => [
          item.id,
          {
            invoice_number: item.invoice_number ?? null,
          },
        ])
      );
    }

    const enrichedRequests = requestRows.map((request) => {
      const costItem = request.cost_item_id ? costItemMap.get(request.cost_item_id) : undefined;
      const soldItem = request.sold_item_id ? soldItemMap.get(request.sold_item_id) : undefined;
      return {
        ...request,
        invoice_number: costItem?.invoice_number ?? soldItem?.invoice_number ?? null,
        order_number: costItem?.order_number ?? null,
      };
    });

    return NextResponse.json({ requests: enrichedRequests });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, role } = await getUserRole();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      costItemId,
      soldItemId,
      fromLocation,
      toLocation,
      action,
      requestId,
      denialReason,
      requestIds,
    } = body;

    if (action === "create") {
      // Validate inputs
      if ((!costItemId && !soldItemId) || !fromLocation || !toLocation) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }
      let customerName: string | null = null;
      let amount: number | null = null;
      let insertPayload: Record<string, string | number | null> = {
        cost_item_id: costItemId ?? null,
        sold_item_id: soldItemId ?? null,
        from_location: fromLocation,
        to_location: toLocation,
        customer_name: "",
        amount: null,
        status: "pending",
        created_by: user.id,
      };

      if (costItemId) {
        const { data: costItem, error: costError } = await supabase
          .from("sa_subscription_cost_items")
          .select("customer_name, amount")
          .eq("id", costItemId)
          .single();

        if (costError || !costItem) {
          return NextResponse.json(
            { error: "Cost item not found" },
            { status: 404 }
          );
        }

        customerName = costItem.customer_name ?? null;
        amount = costItem.amount ?? null;
      }

      if (soldItemId) {
        const { data: soldItem, error: soldError } = await supabase
          .from("sa_subscription_sold_items")
          .select("customer_name, retail_price")
          .eq("id", soldItemId)
          .single();

        if (soldError || !soldItem) {
          return NextResponse.json(
            { error: "Sold item not found" },
            { status: 404 }
          );
        }

        customerName = soldItem.customer_name ?? null;
        amount = soldItem.retail_price ?? null;
      }

      insertPayload = {
        ...insertPayload,
        customer_name: customerName ?? "",
        amount,
      };

      const { data: request, error: createError } = await supabase
        .from("sa_location_change_requests")
        .insert(insertPayload)
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: createError.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ request });
    }

    if (action === "approve") {
      if (!requestId) {
        return NextResponse.json(
          { error: "Missing request ID" },
          { status: 400 }
        );
      }

      if (role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can approve requests" },
          { status: 403 }
        );
      }

      const { data: requestRow, error: requestError } = await supabase
        .from("sa_location_change_requests")
        .select("id, cost_item_id, sold_item_id, to_location")
        .eq("id", requestId)
        .single();

      if (requestError || !requestRow) {
        return NextResponse.json(
          { error: requestError?.message ?? "Request not found" },
          { status: 404 }
        );
      }

      const approvedLocation = String(requestRow.to_location ?? "").trim();
      if (!approvedLocation) {
        return NextResponse.json(
          { error: "Approved location is missing" },
          { status: 400 }
        );
      }

      if (requestRow.cost_item_id) {
        const { error: costUpdateError } = await supabase
          .from("sa_subscription_cost_items")
          .update({ location: approvedLocation })
          .eq("id", requestRow.cost_item_id);

        if (costUpdateError) {
          return NextResponse.json(
            { error: costUpdateError.message },
            { status: 400 }
          );
        }
      }

      if (requestRow.sold_item_id) {
        const { error: soldUpdateError } = await supabase
          .from("sa_subscription_sold_items")
          .update({ location: approvedLocation })
          .eq("id", requestRow.sold_item_id);

        if (soldUpdateError) {
          return NextResponse.json(
            { error: soldUpdateError.message },
            { status: 400 }
          );
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from("sa_location_change_requests")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ request: updated });
    }

    if (action === "deny") {
      if (!requestId) {
        return NextResponse.json(
          { error: "Missing request ID" },
          { status: 400 }
        );
      }

      if (role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can deny requests" },
          { status: 403 }
        );
      }

      const { data: updated, error: updateError } = await supabase
        .from("sa_location_change_requests")
        .update({
          status: "denied",
          denial_reason: denialReason || "",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ request: updated });
    }

    if (action === "delete") {
      if (!requestId) {
        return NextResponse.json(
          { error: "Missing request ID" },
          { status: 400 }
        );
      }

      if (role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can delete requests" },
          { status: 403 }
        );
      }

      const { error: deleteError } = await supabase
        .from("sa_location_change_requests")
        .delete()
        .eq("id", requestId);

      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === "markPrinted") {
      if (!Array.isArray(requestIds) || requestIds.length === 0) {
        return NextResponse.json(
          { error: "requestIds array is required" },
          { status: 400 }
        );
      }

      if (role === "viewer") {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }

      const { data: updated, error: updateError } = await supabase
        .from("sa_location_change_requests")
        .update({
          printed_at: new Date().toISOString(),
          printed_by: user.id,
        })
        .in("id", requestIds)
        .select();

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 400 }
        );
      }

      return NextResponse.json({ requests: updated || [] });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
