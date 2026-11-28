import { describe, expect, it } from "vitest";
import { canRankPrivateDuel } from "./duel-options";

describe("canRankPrivateDuel", () => {
  it("rejects an unranked game even when the stale playlist is ranked", () => {
    expect(canRankPrivateDuel({
      selectionKind: "game",
      gameRanked: false,
      playlist: "quick",
      workshop: false,
      linked: true,
    })).toBe(false);
  });

  it("rejects an experimental playlist even when the stale game is ranked", () => {
    expect(canRankPrivateDuel({
      selectionKind: "playlist",
      gameRanked: true,
      playlist: "experimental",
      workshop: false,
      linked: true,
    })).toBe(false);
  });

  it("allows linked ranked games and playlists", () => {
    expect(canRankPrivateDuel({
      selectionKind: "game",
      gameRanked: true,
      playlist: "quick",
      workshop: false,
      linked: true,
    })).toBe(true);
    expect(canRankPrivateDuel({
      selectionKind: "playlist",
      gameRanked: false,
      playlist: "mind",
      workshop: false,
      linked: true,
    })).toBe(true);
  });
});
