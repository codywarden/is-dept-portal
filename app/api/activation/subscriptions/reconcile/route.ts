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

    const { data: costFiles, error: costError } = await supabase
      .from("sa_subscription_cost_files")
      .select(
        "id, upload_number, original_filename, uploaded_at, item_count, matched_sold_file_id, matched_at, locked_at, locked_by, matched_sold:sa_subscription_sold_files(upload_number, original_filename, uploaded_at)",
      )
      .order("uploaded_at", { ascending: false });

    if (costError) {
      return NextResponse.json({ error: costError.message }, { status: 400 });
    }

    const { data: soldFiles, error: soldError } = await supabase
      .from("sa_subscription_sold_files")
      .select(
        "id, upload_number, original_filename, uploaded_at, item_count, matched_cost_file_id, matched_at, locked_at, locked_by, matched_cost:sa_subscription_cost_files(upload_number, original_filename, uploaded_at)",
      )
      .order("uploaded_at", { ascending: false });

    if (soldError) {
      return NextResponse.json({ error: soldError.message }, { status: 400 });
    }

    return NextResponse.json({ costFiles: costFiles ?? [], soldFiles: soldFiles ?? [] });
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
    // - lock
    // - unlock
    const body = await req.json();
    const { action, costFileId, soldFileId } = body ?? {};

    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }

    if (action === "unlock" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "mark_reconclied") {
      if (!costFileId || !soldFileId) {
        return NextResponse.json({ error: "costFileId and soldFileId required" }, { status: 400 });
      }

      const { data: cost } = await supabase
        .from("sa_subscription_cost_files")
        .select("id, matched_sold_file_id, locked_at")
        .eq("id", costFileId)
        .single();

      const { data: sold } = await supabase
        .from("sa_subscription_sold_files")
        .select("id, matched_cost_file_id, locked_at")
        .eq("id", soldFileId)
        .single();

      if (!cost || !sold) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      if (cost.locked_at || sold.locked_at) {
        return NextResponse.json({ error: "Cannot mark Reconclied on locked files" }, { status: 400 });
      }

      if (cost.matched_sold_file_id || sold.matched_cost_file_id) {
        return NextResponse.json({ error: "One of the files is already Reconclied" }, { status: 400 });
      }

      const matchedAt = new Date().toISOString();

      const costUpdate = await supabase
        .from("sa_subscription_cost_files")
        .update({ matched_sold_file_id: soldFileId, matched_at: matchedAt })
        .eq("id", costFileId);

      if (costUpdate.error) {
        return NextResponse.json({ error: costUpdate.error.message }, { status: 400 });
      }

      const soldUpdate = await supabase
        .from("sa_subscription_sold_files")
        .update({ matched_cost_file_id: costFileId, matched_at: matchedAt })
        .eq("id", soldFileId);

      if (soldUpdate.error) {
        return NextResponse.json({ error: soldUpdate.error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "mark_not_reconclied") {
      if (!costFileId && !soldFileId) {
        return NextResponse.json({ error: "costFileId or soldFileId required" }, { status: 400 });
      }

      const costQuery = costFileId
        ? supabase
            .from("sa_subscription_cost_files")
            .select("id, matched_sold_file_id, locked_at")
            .eq("id", costFileId)
            .single()
        : supabase
            .from("sa_subscription_cost_files")
            .select("id, matched_sold_file_id, locked_at")
            .eq("matched_sold_file_id", soldFileId)
            .single();

      const { data: cost } = await costQuery;

      if (!cost) {
        return NextResponse.json({ error: "Reconclied link not found" }, { status: 404 });
      }

      if (cost.locked_at) {
        return NextResponse.json({ error: "Cannot mark Not Reconclied on locked files" }, { status: 400 });
      }

      const soldId = cost.matched_sold_file_id;

      const costUpdate = await supabase
        .from("sa_subscription_cost_files")
        .update({ matched_sold_file_id: null, matched_at: null })
        .eq("id", cost.id);

      if (costUpdate.error) {
        return NextResponse.json({ error: costUpdate.error.message }, { status: 400 });
      }

      if (soldId) {
        const soldUpdate = await supabase
          .from("sa_subscription_sold_files")
          .update({ matched_cost_file_id: null, matched_at: null })
          .eq("id", soldId);

        if (soldUpdate.error) {
          return NextResponse.json({ error: soldUpdate.error.message }, { status: 400 });
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === "lock" || action === "unlock") {
      if (!costFileId && !soldFileId) {
        return NextResponse.json({ error: "costFileId or soldFileId required" }, { status: 400 });
      }

      const costQuery = costFileId
        ? supabase
            .from("sa_subscription_cost_files")
            .select("id, matched_sold_file_id, locked_at")
            .eq("id", costFileId)
            .single()
        : supabase
            .from("sa_subscription_cost_files")
            .select("id, matched_sold_file_id, locked_at")
            .eq("matched_sold_file_id", soldFileId)
            .single();

      const { data: cost } = await costQuery;

      if (!cost || !cost.matched_sold_file_id) {
        return NextResponse.json({ error: "Reconclied link not found" }, { status: 404 });
      }

      if (action === "lock" && cost.locked_at) {
        return NextResponse.json({ error: "Already locked" }, { status: 400 });
      }

      const lockPatch =
        action === "lock"
          ? { locked_at: new Date().toISOString(), locked_by: user.id }
          : { locked_at: null, locked_by: null };

      const costUpdate = await supabase
        .from("sa_subscription_cost_files")
        .update(lockPatch)
        .eq("id", cost.id);

      if (costUpdate.error) {
        return NextResponse.json({ error: costUpdate.error.message }, { status: 400 });
      }

      const soldUpdate = await supabase
        .from("sa_subscription_sold_files")
        .update(lockPatch)
        .eq("id", cost.matched_sold_file_id);

      if (soldUpdate.error) {
        return NextResponse.json({ error: soldUpdate.error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
