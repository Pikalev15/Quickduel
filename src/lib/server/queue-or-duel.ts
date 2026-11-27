import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ServerAction =
  | "join_matchmaking"
  | "heartbeat_matchmaking"
  | "create_private_duel"
  | "create_private_duel_workshop"
  | "join_private_duel"
  | "send_duel_invitation"
  | "respond_duel_invitation";

export function serverQueueOrDuel(userId: string, action: ServerAction, payload: object) {
  return createSupabaseAdminClient().rpc("server_queue_or_duel", {
    requested_user_id: userId,
    requested_action: action,
    requested_payload: payload,
  });
}
