import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let POST: typeof import("./route").POST;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

describe("match submission route boundary", () => {
  it("rejects invalid JSON without touching trusted services", async () => {
    const request = new Request(
      "https://quickduel.test/api/matches/00000000-0000-4000-8000-000000000001/submit",
      {
        method: "POST",
        body: "{not-json",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": "route-test-correlation",
        },
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({
        matchId: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(payload.error.correlationId).toBe("route-test-correlation");
    expect(response.headers.get("x-correlation-id")).toBe("route-test-correlation");
  });

  it("rejects an invalid match identifier before auth or database work", async () => {
    const request = new Request(
      "https://quickduel.test/api/matches/not-a-match/submit",
      {
        method: "POST",
        body: JSON.stringify({ submission: {}, timedOut: true }),
        headers: { "content-type": "application/json" },
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ matchId: "not-a-match" }),
    });
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(payload.error.message).toBe("Game submission is invalid.");
  });
});
