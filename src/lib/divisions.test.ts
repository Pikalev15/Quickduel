import { describe, expect, it } from "vitest";
import { getDivision, getDivisionChange } from "./divisions";

describe("ranked divisions", () => {
  it.each([
    [100, "bronze"],
    [799, "bronze"],
    [800, "silver"],
    [999, "silver"],
    [1_000, "gold"],
    [1_199, "gold"],
    [1_200, "platinum"],
    [1_399, "platinum"],
    [1_400, "diamond"],
    [1_599, "diamond"],
    [1_600, "master"],
    [4_000, "master"],
  ])("maps %i to %s", (rating, expected) => {
    expect(getDivision(rating).id).toBe(expected);
  });

  it("reports progress and rating needed", () => {
    expect(getDivision(900)).toMatchObject({
      id: "silver",
      progress: 0.5,
      ratingToNext: 100,
    });
  });

  it("reports promotion, demotion, and stable state", () => {
    expect(getDivisionChange(999, 1_000)).toBe("promotion");
    expect(getDivisionChange(1_200, 1_199)).toBe("demotion");
    expect(getDivisionChange(1_050, 1_100)).toBe("none");
  });
});
