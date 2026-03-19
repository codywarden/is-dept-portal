import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";
import { logAdminAction } from "../../../lib/admin/logAdminAction";

const getAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function removeStoragePrefix(admin: ReturnType<typeof getAdminClient>, prefix: string) {
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from("subscriptions").list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(error.message);
    }

    const files = (data ?? []).filter((entry) => Boolean(entry.name)).map((entry) => `${prefix}/${entry.name}`);
    if (files.length > 0) {
      const { error: removeError } = await admin.storage.from("subscriptions").remove(files);
      if (removeError) {
        throw new Error(removeError.message);
      }
    }

    if (!data || data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }
}

export async function POST() {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClient();

    await Promise.all([removeStoragePrefix(admin, "cost"), removeStoragePrefix(admin, "sold")]);

    const { error: deletePrintFilesError } = await admin.from("sa_location_change_print_files").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deletePrintFilesError) {
      return NextResponse.json({ error: deletePrintFilesError.message }, { status: 400 });
    }

    const { error: deleteRequestsError } = await admin.from("sa_location_change_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteRequestsError) {
      return NextResponse.json({ error: deleteRequestsError.message }, { status: 400 });
    }

    const { error: deleteSoldItemsError } = await admin.from("sa_subscription_sold_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteSoldItemsError) {
      return NextResponse.json({ error: deleteSoldItemsError.message }, { status: 400 });
    }

    const { error: deleteCostItemsError } = await admin.from("sa_subscription_cost_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteCostItemsError) {
      return NextResponse.json({ error: deleteCostItemsError.message }, { status: 400 });
    }

    const { error: deleteSoldFilesError } = await admin.from("sa_subscription_sold_files").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteSoldFilesError) {
      return NextResponse.json({ error: deleteSoldFilesError.message }, { status: 400 });
    }

    const { error: deleteCostFilesError } = await admin.from("sa_subscription_cost_files").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteCostFilesError) {
      return NextResponse.json({ error: deleteCostFilesError.message }, { status: 400 });
    }

    const { error: resetCostUploadNumberError } = await admin.rpc("sa_reset_activation_upload_number", {
      p_kind: "cost",
      p_next_number: 1,
    });
    if (resetCostUploadNumberError) {
      return NextResponse.json({ error: resetCostUploadNumberError.message }, { status: 400 });
    }

    const { error: resetSoldUploadNumberError } = await admin.rpc("sa_reset_activation_upload_number", {
      p_kind: "sold",
      p_next_number: 1,
    });
    if (resetSoldUploadNumberError) {
      return NextResponse.json({ error: resetSoldUploadNumberError.message }, { status: 400 });
    }

    await logAdminAction({
      supabaseAdmin: admin,
      action: "clear_all_activation_data",
      actorId: authData.user.id,
      actorEmail: authData.user.email ?? null,
      details: {
        scope: "activation",
        resetUploadNumbersTo: 1,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to clear activation data" }, { status: 500 });
  }
}
