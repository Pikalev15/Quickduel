import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ServerAction =
  | "join_matchmaking"
  | "heartbeat_matchmaking"
  | "create_private_duel"
  | "create_private_duel_workshop"
  | "join_private_duel"
  | "send_duel_invitation"
  | "respond_duel_invitation";

export async function serverQueueOrDuel(supabase: SupabaseClient, userId: string, action: ServerAction, payload: object) {
  const { data: ticket, error } = await createSupabaseAdminClient().rpc("issue_queue_duel_ticket", {
    requested_user_id: userId,
    requested_action: action,
    requested_payload: payload,
  });
  if (error) throw error;
  if (typeof ticket !== "string") throw new Error("Unable to authorize operation");
  return supabase.rpc("server_queue_or_duel", { requested_ticket: ticket });
}
