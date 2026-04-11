import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/app/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // Auth check — admin only
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin" && profile?.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { email, password, firstName, lastName, location, locations, role, cell_phone } =
      await req.json();

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      return NextResponse.json(
        { error: "email, password, firstName, lastName and role are required" },
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
      const msg = authError.message ?? String(authError);
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
          // Auth user exists but profile was deleted (orphaned from a failed delete).
          // Look up the orphaned auth user directly from auth.users by email.
          const { data: authUserRow, error: authLookupErr } = await supabaseAdmin
            .schema("auth")
            .from("users")
            .select("id")
            .eq("email", email)
            .single();

          if (authLookupErr || !authUserRow) {
            return NextResponse.json({ error: msg }, { status: 400 });
          }

          // Update their password to the newly supplied one and reuse their ID
          const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
            authUserRow.id,
            { password, email_confirm: true }
          );
          if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
          }

          userId = authUserRow.id;
        }
      } else {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    } else {
      userId = authData.user?.id ?? null;
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
          location: location || (Array.isArray(locations) ? locations[0] : null) || null,
          locations: Array.isArray(locations) ? locations : (location ? [location] : []),
          role: role || "user",
          cell_phone: cell_phone || null,
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
        location: location || (Array.isArray(locations) ? locations[0] : null) || null,
        locations: Array.isArray(locations) ? locations : (location ? [location] : []),
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
