import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

type UploadKind = "cost" | "sold";

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

    const body = await req.json();
    const kind = body?.kind as UploadKind | undefined;
    const nextNumber = Number(body?.nextNumber ?? NaN);

    if (!kind || !["cost", "sold"].includes(kind)) {
      return NextResponse.json({ error: "kind is required" }, { status: 400 });
    }

    if (!Number.isInteger(nextNumber) || nextNumber < 1) {
      return NextResponse.json({ error: "nextNumber must be an integer >= 1" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { error } = await admin.rpc("sa_reset_activation_upload_number", {
      p_kind: kind,
      p_next_number: nextNumber,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, kind, nextNumber });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to reset upload number" }, { status: 500 });
  }
}
