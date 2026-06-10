import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

const BUCKET = "frankie-firmware";

// GET — proxies the active firmware binary to the board
// Board keeps its existing TLS connection to Vercel; Vercel fetches from Supabase
// server-to-server. This avoids opening a second TLS session on the ESP32,
// which fails with MBEDTLS_ERR_SSL_ALLOC_FAILED when heap is fragmented.
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
      .createSignedUrl(release.storage_path, 120);

    if (urlError || !signed?.signedUrl) {
      return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }

    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Firmware file unavailable" }, { status: 502 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=firmware.bin",
    };
    const contentLength = fileRes.headers.get("Content-Length");
    if (contentLength) headers["Content-Length"] = contentLength;

    return new Response(fileRes.body, { status: 200, headers });
  } catch (error) {
    console.error("[firmware/dl] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
