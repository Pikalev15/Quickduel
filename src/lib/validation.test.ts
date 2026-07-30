import { describe, expect, it } from "vitest";
import { selectedCellsSchema } from "./validation";

describe("selected cell validation", () => {
  it("rejects duplicates and malformed values", () => {
    expect(selectedCellsSchema.safeParse([1, 1]).success).toBe(false);
    expect(selectedCellsSchema.safeParse([-1]).success).toBe(false);
    expect(selectedCellsSchema.safeParse(["1"]).success).toBe(false);
    expect(selectedCellsSchema.safeParse([]).success).toBe(false);
  });
});
