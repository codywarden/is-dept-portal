import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/app/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Check authentication
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    const role = profile?.role ?? "viewer";

    // Only admin and verifier can send commands
    if (role !== "admin" && role !== "verifier") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { command, mouse_x, mouse_y, mouse_relative } = body;

    if (!command || !["enter", "mouse_click", "mouse_move"].includes(command)) {
      return NextResponse.json({ error: "Invalid command" }, { status: 400 });
    }

    // Validate mouse movement parameters
    if (command === "mouse_move") {
      if (typeof mouse_x !== "number" || typeof mouse_y !== "number") {
        return NextResponse.json({ error: "mouse_x and mouse_y required for mouse_move" }, { status: 400 });
      }
    }

    // Insert command into database
    const commandData: any = {
      command,
      status: "pending",
      sent_by: session.user.id,
      created_at: new Date().toISOString(),
    };

    // Add mouse movement parameters if applicable
    if (command === "mouse_move") {
      commandData.mouse_x = mouse_x;
      commandData.mouse_y = mouse_y;
      commandData.mouse_relative = mouse_relative !== false; // default true
    }

    const { data, error } = await supabase
      .from("frankie_commands")
      .insert(commandData)
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to save command" }, { status: 500 });
    }

    return NextResponse.json({ success: true, command: data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET endpoint for ESP32 to fetch pending commands (unauthenticated, uses service role)
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();

    // Get the next pending command
    const { data: command, error } = await supabase
      .from("frankie_commands")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, which is fine
      console.error("Database error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!command) {
      return NextResponse.json({ command: null });
    }

    return NextResponse.json({ command });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH endpoint for ESP32 to mark commands as processed (unauthenticated, uses service role)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();

    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("frankie_commands")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "Failed to update command" }, { status: 500 });
    }

    return NextResponse.json({ success: true, command: data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
