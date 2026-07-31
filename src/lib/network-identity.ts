import { createHmac } from "node:crypto";

export function trustedNetworkAddress(
  request: Request,
  options: { vercel: boolean; explicitLocalDevelopment: boolean },
) {
  if (options.vercel) {
    const value = request.headers.get("x-vercel-forwarded-for");
    return value?.split(",")[0]?.trim() || null;
  }
  if (options.explicitLocalDevelopment) {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "explicit-local-development";
  }
  return null;
}

export function hmacNetworkDigest(address: string, key: string) {
  if (key.length < 32) return null;
  return createHmac("sha256", key).update(address).digest("hex");
}
