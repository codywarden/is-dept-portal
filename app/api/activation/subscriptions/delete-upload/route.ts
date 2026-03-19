import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "../../../../lib/supabase/server";

type UploadKind = "cost" | "sold";

const getAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function requireAdminRole() {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { userId: authData.user.id };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminRole();
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const kind = body?.kind as UploadKind | undefined;
    const fileId = (body?.fileId as string | undefined)?.trim();
    const uploadNumber = Number(body?.uploadNumber ?? NaN);
    const hasUploadNumber = Number.isFinite(uploadNumber) && uploadNumber > 0;

    if (!kind || !["cost", "sold"].includes(kind) || (!fileId && !hasUploadNumber)) {
      return NextResponse.json({ error: "kind and (fileId or uploadNumber) are required" }, { status: 400 });
    }

    const admin = getAdminClient();

    let resolvedFileId = fileId;

    if (!resolvedFileId && hasUploadNumber) {
      if (kind === "cost") {
        const { data: fileByNumber, error: fileByNumberError } = await admin
          .from("sa_subscription_cost_files")
          .select("id")
          .eq("upload_number", uploadNumber)
          .maybeSingle();

        if (fileByNumberError) {
          return NextResponse.json({ error: fileByNumberError.message }, { status: 400 });
        }

        if (!fileByNumber?.id) {
          return NextResponse.json({ error: "Cost upload not found" }, { status: 404 });
        }

        resolvedFileId = fileByNumber.id;
      } else {
        const { data: fileByNumber, error: fileByNumberError } = await admin
          .from("sa_subscription_sold_files")
          .select("id")
          .eq("upload_number", uploadNumber)
          .maybeSingle();

        if (fileByNumberError) {
          return NextResponse.json({ error: fileByNumberError.message }, { status: 400 });
        }

        if (!fileByNumber?.id) {
          return NextResponse.json({ error: "Sold upload not found" }, { status: 404 });
        }

        resolvedFileId = fileByNumber.id;
      }
    }

    if (kind === "cost") {
      const { data: file, error: fileError } = await admin
        .from("sa_subscription_cost_files")
        .select("id, storage_path, matched_sold_file_id")
        .eq("id", resolvedFileId)
        .single();

      if (fileError || !file) {
        return NextResponse.json({ error: "Cost upload not found" }, { status: 404 });
      }

      if (file.matched_sold_file_id) {
        const soldUnmatch = await admin
          .from("sa_subscription_sold_files")
          .update({ matched_cost_file_id: null, matched_at: null, locked_at: null, locked_by: null })
          .eq("id", file.matched_sold_file_id);

        if (soldUnmatch.error) {
          return NextResponse.json({ error: soldUnmatch.error.message }, { status: 400 });
        }
      }

      const costUnmatch = await admin
        .from("sa_subscription_cost_files")
        .update({ matched_sold_file_id: null, matched_at: null, locked_at: null, locked_by: null })
        .eq("id", resolvedFileId);

      if (costUnmatch.error) {
        return NextResponse.json({ error: costUnmatch.error.message }, { status: 400 });
      }

      const deleteItems = await admin.from("sa_subscription_cost_items").delete().eq("file_id", resolvedFileId);
      if (deleteItems.error) {
        return NextResponse.json({ error: deleteItems.error.message }, { status: 400 });
      }

      const deleteFile = await admin.from("sa_subscription_cost_files").delete().eq("id", resolvedFileId);
      if (deleteFile.error) {
        return NextResponse.json({ error: deleteFile.error.message }, { status: 400 });
      }

      if (file.storage_path) {
        const removeStorage = await admin.storage.from("subscriptions").remove([file.storage_path]);
        if (removeStorage.error) {
          return NextResponse.json({ error: removeStorage.error.message }, { status: 400 });
        }
      }

      return NextResponse.json({ success: true });
    }

    const { data: file, error: fileError } = await admin
      .from("sa_subscription_sold_files")
      .select("id, storage_path, matched_cost_file_id")
      .eq("id", resolvedFileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "Sold upload not found" }, { status: 404 });
    }

    if (file.matched_cost_file_id) {
      const costUnmatch = await admin
        .from("sa_subscription_cost_files")
        .update({ matched_sold_file_id: null, matched_at: null, locked_at: null, locked_by: null })
        .eq("id", file.matched_cost_file_id);

      if (costUnmatch.error) {
        return NextResponse.json({ error: costUnmatch.error.message }, { status: 400 });
      }
    }

    const soldUnmatch = await admin
      .from("sa_subscription_sold_files")
      .update({ matched_cost_file_id: null, matched_at: null, locked_at: null, locked_by: null })
      .eq("id", resolvedFileId);

    if (soldUnmatch.error) {
      return NextResponse.json({ error: soldUnmatch.error.message }, { status: 400 });
    }

    const deleteItems = await admin.from("sa_subscription_sold_items").delete().eq("file_id", resolvedFileId);
    if (deleteItems.error) {
      return NextResponse.json({ error: deleteItems.error.message }, { status: 400 });
    }

    const deleteFile = await admin.from("sa_subscription_sold_files").delete().eq("id", resolvedFileId);
    if (deleteFile.error) {
      return NextResponse.json({ error: deleteFile.error.message }, { status: 400 });
    }

    if (file.storage_path) {
      const removeStorage = await admin.storage.from("subscriptions").remove([file.storage_path]);
      if (removeStorage.error) {
        return NextResponse.json({ error: removeStorage.error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
