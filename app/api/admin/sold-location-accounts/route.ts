import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/app/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service role environment variables");
  }

  return createClient(url, key);
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sa_location_sold_account_numbers")
      .select("location_name, account_number")
      .order("location_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load sold-to account numbers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json(
      { error: "Failed to load sold-to account numbers" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = (await req.json()) as {
      locationName?: string;
      accountNumber?: string;
    };

    const locationName = body.locationName?.trim();
    const accountNumber = body.accountNumber?.trim() ?? "";

    if (!locationName) {
      return NextResponse.json(
        { error: "locationName is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    if (!accountNumber) {
      const { error } = await supabase
        .from("sa_location_sold_account_numbers")
        .delete()
        .eq("location_name", locationName);

      if (error) {
        return NextResponse.json(
          { error: "Failed to clear sold-to account number" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from("sa_location_sold_account_numbers")
      .upsert(
        {
          location_name: locationName,
          account_number: accountNumber,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_name" }
      );

    if (error) {
      return NextResponse.json(
        { error: "Failed to save sold-to account number" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
