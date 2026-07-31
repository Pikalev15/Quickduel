import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  hmacNetworkDigest,
  trustedNetworkAddress,
} from "@/lib/network-identity";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export class AdaptiveChallengeRequired extends Error {
  readonly siteKey: string | null;

  constructor(siteKey: string | null) {
    super("ADAPTIVE_CHALLENGE_REQUIRED");
    this.name = "AdaptiveChallengeRequired";
    this.siteKey = siteKey;
  }
}

function serverNetworkAddress(request: Request) {
  return trustedNetworkAddress(request, {
    vercel: process.env.VERCEL === "1",
    explicitLocalDevelopment:
      process.env.NODE_ENV !== "production"
      && process.env.ABUSE_CHALLENGE_DEV_BYPASS === "true",
  });
}

export function networkDigest(request: Request) {
  const address = serverNetworkAddress(request);
  const key = process.env.RATE_LIMIT_HASH_KEY;
  if (!address || !key) return null;
  return hmacNetworkDigest(address, key);
}

async function verifyTurnstile(request: Request, token: string) {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ABUSE_CHALLENGE_DEV_BYPASS === "true"
  ) {
    return true;
  }
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  body.set("idempotency_key", randomUUID());
  const address = serverNetworkAddress(request);
  if (address) body.set("remoteip", address);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const result = (await response.json()) as {
      success?: boolean;
      hostname?: string;
    };
    if (!response.ok || result.success !== true) return false;
    const expectedHost = new URL(
      process.env.NEXT_PUBLIC_APP_URL ?? request.url,
    ).hostname;
    return !result.hostname || result.hostname === expectedHost;
  } catch {
    return false;
  }
}

export async function enforceNetworkAbuseBoundary(
  request: Request,
  action: string,
  limit: number,
  windowSeconds: number,
  options: { adaptiveChallenge: boolean },
) {
  const digest = networkDigest(request);
  if (!digest) {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ABUSE_CHALLENGE_DEV_BYPASS === "true"
    ) {
      return;
    }
    throw new AdaptiveChallengeRequired(
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
    );
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("check_network_rate_limit", {
    requested_network_digest: digest,
    requested_action: action,
    requested_limit: limit,
    requested_window_seconds: windowSeconds,
  });
  if (error) throw error;
  const result = data as {
    allowed?: boolean;
    challenge_required?: boolean;
  } | null;
  if (result?.challenge_required && options.adaptiveChallenge) {
    if (
      process.env.NODE_ENV !== "production"
      && process.env.ABUSE_CHALLENGE_DEV_BYPASS === "true"
    ) {
      return;
    }
    const token = request.headers.get("x-quickduel-challenge");
    if (!token || !(await verifyTurnstile(request, token))) {
      throw new AdaptiveChallengeRequired(
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
      );
    }
  }
  if (result?.allowed === false) {
    throw new Error("QD_NETWORK_RATE_LIMITED");
  }
}
