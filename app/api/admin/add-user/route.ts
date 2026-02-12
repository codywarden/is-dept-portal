import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName, location, role } =
      await req.json();

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !location || !role) {
      return NextResponse.json(
        { error: "email, password, firstName, lastName, location and role are required" },
        { status: 400 }
      );
    }

    // Create service role client (server-only)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create user with Supabase Auth
    let userId: string | null = null;
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      // If the auth user already exists, try to find their profile by email
      const msg = (authError as any)?.message ?? String(authError);
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists")) {
        const { data: existingProfiles, error: fetchErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .limit(1);

        if (fetchErr) {
          return NextResponse.json({ error: fetchErr.message }, { status: 400 });
        }

        if (existingProfiles && existingProfiles.length > 0) {
          userId = existingProfiles[0].id;
        } else {
          return NextResponse.json({ error: msg }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    } else {
      userId = (authData as any).user.id;
    }

    // Create or update user profile (upsert to avoid unique id conflicts)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          first_name: firstName || null,
          last_name: lastName || null,
          location: location || null,
          role: role || "viewer",
        },
        { onConflict: "id" }
      );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        location,
        role,
      },
    });
  } catch (error) {
    console.error("Error adding user:", error);
    return NextResponse.json(
      { error: "Failed to add user" },
      { status: 500 }
    );
  }
}
