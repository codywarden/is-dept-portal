import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";
import { logAdminAction } from "../../../lib/admin/logAdminAction";

const getAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
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

    const { invoiceNumber } = await req.json();
    const normalizedInvoice = String(invoiceNumber ?? "").trim();

    if (!normalizedInvoice) {
      return NextResponse.json({ error: "invoiceNumber is required" }, { status: 400 });
    }

    const admin = getAdminClient();

    const { data: deletedRows, error: deleteError } = await admin
      .from("sa_subscription_sold_items")
      .delete()
      .eq("invoice_number", normalizedInvoice)
      .select("id, file_id");

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    const rows = deletedRows ?? [];
    const affectedFileIds = Array.from(
      new Set(rows.map((r) => r.file_id).filter((id): id is string => Boolean(id))),
    );

    for (const fileId of affectedFileIds) {
      const [{ count: itemCount, error: countError }, { count: reconcliedCount, error: reconcliedError }] = await Promise.all([
        admin
          .from("sa_subscription_sold_items")
          .select("id", { head: true, count: "exact" })
          .eq("file_id", fileId),
        admin
          .from("sa_subscription_sold_items")
          .select("id", { head: true, count: "exact" })
          .eq("file_id", fileId)
          .not("matched_customer_id", "is", null),
      ]);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 400 });
      }

      if (reconcliedError) {
        return NextResponse.json({ error: reconcliedError.message }, { status: 400 });
      }

      const { error: updateFileError } = await admin
        .from("sa_subscription_sold_files")
        .update({ item_count: itemCount ?? 0, matched_count: reconcliedCount ?? 0 })
        .eq("id", fileId);

      if (updateFileError) {
        return NextResponse.json({ error: updateFileError.message }, { status: 400 });
      }
    }

    await logAdminAction({
      supabaseAdmin: admin,
      action: "clear_retail_invoice",
      actorId: authData.user.id,
      actorEmail: authData.user.email ?? null,
      details: {
        invoiceNumber: normalizedInvoice,
        deletedCount: rows.length,
      },
    });

    return NextResponse.json({
      success: true,
      invoiceNumber: normalizedInvoice,
      deletedCount: rows.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to clear invoice number" }, { status: 500 });
  }
}
