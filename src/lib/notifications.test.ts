import { describe, expect, it } from "vitest";
import { activeRequests, requestTitle, type PlayerRequest } from "./notifications";
describe("request notifications", () => {
  it("excludes expired requests but keeps persistent friend requests", () => {
    const base = { sender: "Player", createdAt: new Date(0).toISOString(), detail: "Request" };
    const items: PlayerRequest[] = [
      { ...base, id: "friend", kind: "friend", expiresAt: null },
      { ...base, id: "old", kind: "rematch", expiresAt: new Date(1000).toISOString() },
      { ...base, id: "new", kind: "duel", expiresAt: new Date(3000).toISOString() },
    ];
    expect(activeRequests(items, 2000, new Set()).map(item => item.id)).toEqual(["friend","new"]);
    expect(activeRequests(items, 2000, new Set(["friend"])).map(item => item.id)).toEqual(["new"]);
    expect(requestTitle("rematch_ready")).toBe("Rematch ready");
  });
});
