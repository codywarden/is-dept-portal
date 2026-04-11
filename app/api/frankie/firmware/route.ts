import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";
import { createSupabaseServer } from "@/app/lib/supabase/server";

// GET - check if update available (called by ESP32 and dashboard)
// ?version=1.0.0
export async function GET(req: NextRequest) {
  try {
    const currentVersion = req.nextUrl.searchParams.get("version") ?? "";
    const supabase = createSupabaseAdmin();

    const { data: release, error } = await supabase
      .from("frankie_firmware_releases")
      .select("id, version, storage_path, notes, created_at")
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!release) {
      return NextResponse.json({ update_available: false });
    }

    if (currentVersion === release.version) {
      return NextResponse.json({ update_available: false, current_version: release.version });
    }

    // Generate a 120-second signed URL for the firmware binary
    const { data: signedUrl, error: urlError } = await supabase
      .storage
      .from("frankie-firmware")
      .createSignedUrl(release.storage_path, 120);

    if (urlError || !signedUrl) {
      console.error("Failed to create signed URL:", urlError);
      return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }

    return NextResponse.json({
      update_available: true,
      version: release.version,
      notes: release.notes,
      url: signedUrl.signedUrl,
    });
  } catch (error) {
    console.error("Firmware check error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - upload new firmware release (admin only)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("role, page_permissions").eq("id", user.id).single();
    const canFirmware = profile?.role === "admin" || (profile?.page_permissions as Record<string, boolean> | null)?.["frankie_firmware"] === true;
    if (!canFirmware) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const version = (formData.get("version") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim() || null;
    const setActive = formData.get("set_active") === "true";

    if (!file || !version) {
      return NextResponse.json({ error: "file and version are required" }, { status: 400 });
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return NextResponse.json({ error: "Version must be in format X.Y.Z" }, { status: 400 });
    }

    const adminSupabase = createSupabaseAdmin();

    // Check version doesn't already exist
    const { data: existing } = await adminSupabase
      .from("frankie_firmware_releases")
      .select("id").eq("version", version).single();
    if (existing) {
      return NextResponse.json({ error: `Version ${version} already exists` }, { status: 409 });
    }

    // Upload binary to storage
    const storagePath = `firmware/${version}/${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminSupabase.storage
      .from("frankie-firmware")
      .upload(storagePath, buffer, { contentType: "application/octet-stream", upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload firmware file" }, { status: 500 });
    }

    // If setting active, deactivate current active release first
    if (setActive) {
      await adminSupabase
        .from("frankie_firmware_releases")
        .update({ is_active: false })
        .eq("is_active", true);
    }

    // Insert release record
    const { data: release, error: insertError } = await adminSupabase
      .from("frankie_firmware_releases")
      .insert({ version, storage_path: storagePath, notes, is_active: setActive, uploaded_by: user.id })
      .select().single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json({ error: "Failed to save release record" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...release });
  } catch (error) {
    console.error("Firmware upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH - activate an existing release (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("role, page_permissions").eq("id", user.id).single();
    const canFirmware = profile?.role === "admin" || (profile?.page_permissions as Record<string, boolean> | null)?.["frankie_firmware"] === true;
    if (!canFirmware) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const adminSupabase = createSupabaseAdmin();

    // Deactivate all, then activate the selected one
    await adminSupabase
      .from("frankie_firmware_releases")
      .update({ is_active: false })
      .eq("is_active", true);

    const { data: release, error } = await adminSupabase
      .from("frankie_firmware_releases")
      .update({ is_active: true })
      .eq("id", id)
      .select().single();

    if (error) {
      return NextResponse.json({ error: "Failed to activate release" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...release });
  } catch (error) {
    console.error("Firmware activate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
