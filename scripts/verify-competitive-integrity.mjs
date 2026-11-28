import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL;
const anonKey = process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY;
const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY;
assert.ok(url && new URL(url).hostname === "127.0.0.1", "Only local database tests are allowed");
assert.ok(anonKey && serviceKey, "Local credentials are missing");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const createPlayer = async () => {
  const client = createClient(url, anonKey, options);
  const { data, error } = await client.auth.signInAnonymously();
  assert.ifError(error);
  assert.ok(data.user?.id);
  return { client, id: data.user.id };
};
const a = await createPlayer();
const b = await createPlayer();
const issue = async (player, action, payload) => {
  const { data, error } = await admin.rpc("issue_queue_duel_ticket", {
    requested_user_id: player.id, requested_action: action, requested_payload: payload,
  });
  assert.ifError(error);
  assert.equal(typeof data, "string");
  return data;
};
const redeem = (player, ticket) => player.client.rpc("server_queue_or_duel", { requested_ticket: ticket });
const queue = { requested_playlist: "quick", requested_game: "memory_grid" };
const duel = { requested_selection_kind: "game", requested_game: "memory_grid", requested_playlist: "quick", requested_best_of: 1, requested_ranked: false };
assert.ok((await a.client.rpc("join_matchmaking", queue)).error, "Direct queue call must fail");
assert.ok((await a.client.rpc("issue_queue_duel_ticket", { requested_user_id: a.id, requested_action: "join_matchmaking", requested_payload: queue })).error, "Client issuance must fail");

const ticket = await issue(a, "join_matchmaking", queue);
assert.ok((await redeem(b, ticket)).error, "Cross-account redemption must fail");
const first = await redeem(a, ticket);
assert.ifError(first.error);
assert.equal(first.data.queued, true);
assert.ok((await redeem(a, ticket)).error, "Replay must fail");
const second = await redeem(b, await issue(b, "join_matchmaking", queue));
assert.ifError(second.error);
assert.ok(second.data.match_id, "Two real users must match");
const snapshot = await a.client.rpc("get_match_snapshot", { requested_match_id: second.data.match_id });
assert.ifError(snapshot.error);
assert.equal(snapshot.data.current_user_id, a.id);

const denied = await redeem(a, await issue(a, "create_private_duel", { ...duel, requested_ranked: true }));
assert.ok(denied.error, "Anonymous ranked creation must fail");
const created = await redeem(a, await issue(a, "create_private_duel", duel));
assert.ifError(created.error);
assert.ok(created.data.code);
const joined = await redeem(b, await issue(b, "join_private_duel", { requested_code: created.data.code }));
assert.ifError(joined.error);

const policies = [
  ["queue_write",120,60], ["profile_update",6,3600], ["private_duel_create",8,3600],
  ["private_duel_join",20,3600], ["share_card",30,3600], ["friend_search",30,600],
  ["friend_request",12,3600], ["duel_invitation",10,3600], ["match_chat",8,60],
  ["chat_report",6,3600], ["daily_duel",20,60], ["match_submission",30,60], ["skill_rewards",10,60],
];
const limit = (action, max, seconds) => a.client.rpc("check_rate_limit", { requested_action: action, requested_limit: max, requested_window_seconds: seconds });
for (const args of policies) assert.ifError((await limit(...args)).error);
for (const args of [["unknown-action",100,60],["profile_update",999,3600],["profile_update",6,1],[null,null,null]]) {
  assert.equal((await limit(...args)).error?.message, "Invalid rate limit");
}
for (let i=1; i<6; i++) assert.ifError((await limit("profile_update",6,3600)).error);
assert.equal((await limit("profile_update",6,3600)).error?.message, "Rate limit exceeded");
console.log("Real local sessions: identity, ticket grants, replay, matchmaking, private duel and rate-limit tests passed.");
