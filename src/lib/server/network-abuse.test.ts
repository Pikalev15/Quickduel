import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

import { enforceNetworkAbuseBoundary } from "./network-abuse";

describe("network abuse enforcement", () => {
  const request = new Request("https://quickduel.test", {
    headers: { "x-vercel-forwarded-for": "203.0.113.42" },
  });
  const check = () => enforceNetworkAbuseBoundary(request, "matchmaking_join", 20, 60, { adaptiveChallenge: false });

  beforeEach(() => {
    rpc.mockReset();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("RATE_LIMIT_HASH_KEY", "a".repeat(32));
    vi.stubEnv("ABUSE_CHALLENGE_DEV_BYPASS", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only an explicit allowed response", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, challenge_required: false }, error: null });
    await expect(check()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("check_network_rate_limit", expect.objectContaining({
      requested_action: "matchmaking_join",
      requested_limit: 20,
    }));
  });
  it.each([null, {}, { allowed: true }, { allowed: "true", challenge_required: false }])(
    "fails closed for malformed limiter response %j",
    async data => {
      rpc.mockResolvedValue({ data, error: null });
      await expect(check()).rejects.toThrow("QD_NETWORK_LIMIT_UNAVAILABLE");
    },
  );
  it("rejects over-limit requests before attempting a challenge", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, challenge_required: true }, error: null });
    await expect(enforceNetworkAbuseBoundary(request, "matchmaking_join", 20, 60, { adaptiveChallenge: true }))
      .rejects.toThrow("QD_NETWORK_RATE_LIMITED");
  });
});
