import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";
import { createSupabaseServer } from "@/app/lib/supabase/server";

const BUCKET = "frankie-firmware";
const PATH_PREFIX = "planter";

async function canManage() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase
      .from("profiles").select("role, page_permissions").eq("id", user.id).single();
    const perms = (profile?.page_permissions ?? {}) as Record<string, boolean>;
    return profile?.role === "admin" || perms["frankie_planter_firmware"] === true;
  } catch { return false; }
}

// GET — ESP32 polls for update, dashboard checks current status
// ?version=2.6.0
export async function GET(req: NextRequest) {
  try {
    const currentVersion = req.nextUrl.searchParams.get("version") ?? "";
    const supabase = createSupabaseAdmin();

    const { data: release, error } = await supabase
      .from("planter_firmware_releases")
      .select("id, version, storage_path, notes, created_at")
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!release) return NextResponse.json({ update_available: false });

    if (currentVersion === release.version) {
      return NextResponse.json({ update_available: false, current_version: release.version });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    return NextResponse.json({
      update_available: true,
      version: release.version,
      url: `${baseUrl}/api/frankie/planter/firmware/dl`,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — upload new planter firmware release
export async function POST(req: NextRequest) {
  try {
    if (!await canManage()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    const formData = await req.formData();
    const file        = formData.get("file") as File | null;
    const version     = (formData.get("version") as string)?.trim();
    const notes       = (formData.get("notes") as string)?.trim() || null;
    const setActive   = formData.get("set_active") === "true";

    if (!file || !version) {
      return NextResponse.json({ error: "file and version are required" }, { status: 400 });
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return NextResponse.json({ error: "Version must be X.Y.Z" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    const { data: existing } = await admin
      .from("planter_firmware_releases").select("id").eq("version", version).single();
    if (existing) {
      return NextResponse.json({ error: `Version ${version} already exists` }, { status: 409 });
    }

    const storagePath = `${PATH_PREFIX}/${version}/${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: "application/octet-stream", upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: "Failed to upload firmware file" }, { status: 500 });
    }

    if (setActive) {
      await admin.from("planter_firmware_releases").update({ is_active: false }).eq("is_active", true);
    }

    const { data: release, error: insertError } = await admin
      .from("planter_firmware_releases")
      .insert({ version, storage_path: storagePath, notes, is_active: setActive, uploaded_by: user!.id })
      .select().single();

    if (insertError) {
      return NextResponse.json({ error: "Failed to save release record" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...release });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — activate an existing release
export async function PATCH(req: NextRequest) {
  try {
    if (!await canManage()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const admin = createSupabaseAdmin();
    await admin.from("planter_firmware_releases").update({ is_active: false }).eq("is_active", true);

    const { data: release, error } = await admin
      .from("planter_firmware_releases")
      .update({ is_active: true }).eq("id", id).select().single();

    if (error) return NextResponse.json({ error: "Failed to activate release" }, { status: 500 });

    return NextResponse.json({ success: true, ...release });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
