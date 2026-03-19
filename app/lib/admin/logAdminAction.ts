import type { SupabaseClient } from "@supabase/supabase-js";

type LogAdminActionInput = {
  supabaseAdmin: SupabaseClient;
  action: string;
  actorId: string;
  actorEmail?: string | null;
  details?: Record<string, unknown>;
};

export async function logAdminAction({
  supabaseAdmin,
  action,
  actorId,
  actorEmail,
  details,
}: LogAdminActionInput) {
  try {
    await supabaseAdmin.from("sa_admin_action_logs").insert({
      action,
      actor_id: actorId,
      actor_email: actorEmail ?? null,
      details: details ?? {},
    });
  } catch (err) {
    console.warn("Failed to write admin action log:", err);
  }
}
