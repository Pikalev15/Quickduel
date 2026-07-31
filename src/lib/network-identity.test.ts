import { describe, expect, it } from "vitest";
import { hmacNetworkDigest, trustedNetworkAddress } from "./network-identity";

describe("privacy-preserving network identity", () => {
  const rawAddress = "203.0.113.42";
  const firstKey = "a".repeat(32);
  const secondKey = "b".repeat(32);

  it("trusts Vercel metadata and ignores a spoofed generic header", () => {
    const request = new Request("https://quickduel.test", {
      headers: {
        "x-vercel-forwarded-for": rawAddress,
        "x-forwarded-for": "198.51.100.99",
      },
    });
    expect(trustedNetworkAddress(request, {
      vercel: true,
      explicitLocalDevelopment: false,
    })).toBe(rawAddress);
  });

  it("does not trust client IP headers outside Vercel without explicit dev mode", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": rawAddress },
    });
    expect(trustedNetworkAddress(request, {
      vercel: false,
      explicitLocalDevelopment: false,
    })).toBeNull();
  });

  it("never embeds the raw address and rotates with the secret", () => {
    const first = hmacNetworkDigest(rawAddress, firstKey);
    const second = hmacNetworkDigest(rawAddress, secondKey);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(rawAddress);
    expect(second).not.toBe(first);
  });
});
