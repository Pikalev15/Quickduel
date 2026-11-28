import { describe, expect, it } from "vitest";
import { duelInvitationSchema, selectedCellsSchema, submitAnswerSchema } from "./validation";

describe("selected cell validation", () => {
  it("rejects duplicates and malformed values", () => {
    expect(selectedCellsSchema.safeParse([1, 1]).success).toBe(false);
    expect(selectedCellsSchema.safeParse([-1]).success).toBe(false);
    expect(selectedCellsSchema.safeParse(["1"]).success).toBe(false);
    expect(selectedCellsSchema.safeParse([]).success).toBe(false);
  });
});

describe("answer submission validation", () => {
  it("defaults normal answers to not timed out", () => {
    expect(
      submitAnswerSchema.parse({ submission: { order: [0, 1] } }),
    ).toEqual({
      submission: { order: [0, 1] },
      timedOut: false,
    });
  });

  it("accepts an explicit deadline submission", () => {
    expect(
      submitAnswerSchema.safeParse({ submission: {}, timedOut: true }).success,
    ).toBe(true);
  });
});

describe("duel invitation validation", () => {
  const invitation = { publicCode: "ABC123", selectionKind: "game", game: "memory_grid", playlist: "mind", bestOf: 1, ranked: false };

  it("accepts standard invitations", () => {
    expect(duelInvitationSchema.safeParse(invitation).success).toBe(true);
  });

  it("rejects otherwise valid Workshop invitations", () => {
    expect(duelInvitationSchema.safeParse({ ...invitation, workshop: { version: 1, revealMs: 2500, answerMs: 7000, memory: { size: 4, tiles: 6, ordered: false } } }).success).toBe(false);
  });
});
