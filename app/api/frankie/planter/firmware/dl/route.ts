import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

const BUCKET = "frankie-firmware";

// GET — redirects to the active firmware binary (board follows the 302 to download)
// Keeps the URL returned to the board short so it fits in ESP32 JSON buffers
export async function GET() {
  try {
    const supabase = createSupabaseAdmin();

    const { data: release, error } = await supabase
      .from("planter_firmware_releases")
      .select("storage_path")
      .eq("is_active", true)
      .single();

    if (error || !release) {
      return NextResponse.json({ error: "No active release" }, { status: 404 });
    }

    const { data: signed, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(release.storage_path, 3600);

    if (urlError || !signed?.signedUrl) {
      return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }

    return NextResponse.redirect(signed.signedUrl, 302);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
