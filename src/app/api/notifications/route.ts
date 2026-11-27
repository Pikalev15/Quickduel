import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PlayerRequest } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type FriendRow = { id: string; requester_id: string; created_at: string };
type DuelRow = { id: string; sender_id: string; private_duel_id: string; created_at: string; expires_at: string };
type MatchRow = { id: string; status: string; completed_at: string | null; rematch_match_id: string | null; private_duel_id: string | null; invalidated_at: string | null; expires_at: string };
type Participant = { match_id: string; user_id: string; rematch_requested_at: string | null };

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return apiError(401, "UNAUTHENTICATED", "Sign in to see requests.", undefined, correlationId);
    const admin = createSupabaseAdminClient();
    const now = Date.now();
    const since = new Date(now - 180_000).toISOString();
    const [friends, invites, own, blocks] = await Promise.all([
      admin.from("friend_requests").select("id,requester_id,created_at").eq("recipient_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(50),
      admin.from("duel_invitations").select("id,sender_id,private_duel_id,created_at,expires_at").eq("recipient_id", user.id).eq("status", "pending").gt("expires_at", new Date(now).toISOString()).order("created_at", { ascending: false }).limit(50),
      admin.from("match_players").select("match_id,matches!inner(completed_at)").eq("user_id", user.id).eq("matches.status", "completed").gte("matches.completed_at", since).order("completed_at", { referencedTable: "matches", ascending: false }).limit(30),
      admin.from("user_blocks").select("blocker_id,blocked_id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    ]);
    for (const result of [friends, invites, own, blocks]) if (result.error) throw result.error;
    const friendRows = (friends.data ?? []) as FriendRow[];
    const inviteRows = (invites.data ?? []) as DuelRow[];
    const blocked = new Set((blocks.data ?? []).map(row => row.blocker_id === user.id ? row.blocked_id : row.blocker_id));
    const matchIds = (own.data ?? []).map(row => row.match_id);
    const lobbyIds = [...new Set(inviteRows.map(row => row.private_duel_id))];
    const [matchesResult, playersResult, lobbiesResult] = await Promise.all([
      matchIds.length ? admin.from("matches").select("id,status,completed_at,rematch_match_id,private_duel_id,invalidated_at,expires_at").in("id", matchIds) : Promise.resolve({ data: [], error: null }),
      matchIds.length ? admin.from("match_players").select("match_id,user_id,rematch_requested_at").in("match_id", matchIds) : Promise.resolve({ data: [], error: null }),
      lobbyIds.length ? admin.from("private_duels").select("id,host_id,state,best_of,ranked,guest_id,expires_at").in("id", lobbyIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [matchesResult, playersResult, lobbiesResult]) if (result.error) throw result.error;
    const matches = (matchesResult.data ?? []) as MatchRow[];
    const players = (playersResult.data ?? []) as Participant[];
    const lobbies = new Map((lobbiesResult.data ?? []).map(row => [row.id, row]));
    const readyIds = [...new Set(matches.flatMap(row => row.rematch_match_id ? [row.rematch_match_id] : []))];
    const readyResult = readyIds.length ? await admin.from("matches").select("id,status,expires_at").in("id", readyIds).in("status", ["waiting","countdown"]).gt("expires_at", new Date(now).toISOString()) : { data: [], error: null };
    if (readyResult.error) throw readyResult.error;
    const readyMatches = new Map((readyResult.data ?? []).map(row => [row.id, row]));
    const senders = [...new Set([...friendRows.map(row => row.requester_id), ...inviteRows.map(row => row.sender_id), ...players.filter(row => row.user_id !== user.id).map(row => row.user_id)])].filter(id => id !== user.id && !blocked.has(id));
    const profileResult = senders.length ? await admin.from("profiles").select("id,display_name").in("id", senders).is("deleted_at", null) : { data: [], error: null };
    if (profileResult.error) throw profileResult.error;
    const names = new Map((profileResult.data ?? []).map(row => [row.id, row.display_name]));
    const requests: PlayerRequest[] = [];
    for (const row of friendRows) {
      const sender = names.get(row.requester_id);
      if (sender) requests.push({ id: row.id, kind: "friend", sender, createdAt: row.created_at, expiresAt: null, detail: "Wants to add you as a friend." });
    }
    for (const row of inviteRows) {
      const sender = names.get(row.sender_id);
      const lobby = lobbies.get(row.private_duel_id);
      if (!sender || !lobby || lobby.host_id !== row.sender_id || lobby.state !== "waiting" || lobby.guest_id || Date.parse(lobby.expires_at) <= now) continue;
      requests.push({ id: row.id, kind: "duel", sender, createdAt: row.created_at, expiresAt: row.expires_at, detail: `${lobby.best_of === 1 ? "Single game" : `Best of ${lobby.best_of}`} · ${lobby.ranked ? "Ranked" : "Unranked"}` });
    }
    for (const match of matches) {
      if (match.status !== "completed" || match.private_duel_id || match.invalidated_at || !match.completed_at) continue;
      const me = players.find(row => row.match_id === match.id && row.user_id === user.id);
      const other = players.find(row => row.match_id === match.id && row.user_id !== user.id);
      const sender = other && names.get(other.user_id);
      if (!me || !other || !sender) continue;
      const ready = match.rematch_match_id && readyMatches.get(match.rematch_match_id);
      if (ready && me.rematch_requested_at && other.rematch_requested_at) {
        requests.push({ id: match.id, kind: "rematch_ready", sender, createdAt: other.rematch_requested_at, expiresAt: ready.expires_at, detail: "Your rematch is ready to join.", matchId: ready.id });
        continue;
      }
      const expiresAt = new Date(Date.parse(match.completed_at) + 60_000).toISOString();
      if (!match.rematch_match_id && !me.rematch_requested_at && other.rematch_requested_at && Date.parse(expiresAt) > now) {
        requests.push({ id: match.id, kind: "rematch", sender, createdAt: other.rematch_requested_at, expiresAt, detail: "Wants another round.", matchId: match.id });
      }
    }
    requests.sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const response = apiSuccess({ userId: user.id, requests }, 200, correlationId);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/notifications");
  }
}
