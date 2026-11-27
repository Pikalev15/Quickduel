import { describe, expect, it } from "vitest";
import { getPlacement } from "./placements";
describe("placement matches", () => {
  it("requires five counted ranked matches", () => {
    expect(getPlacement(0)).toEqual({ completed: 0, required: 5, remaining: 5, placed: false });
    expect(getPlacement(4)).toMatchObject({ completed: 4, remaining: 1, placed: false });
    expect(getPlacement(5)).toMatchObject({ completed: 5, remaining: 0, placed: true });
    expect(getPlacement(100)).toMatchObject({ completed: 5, placed: true });
  });
  it("fails closed for unavailable progress", () => {
    expect(getPlacement(undefined)).toBeNull();
    expect(getPlacement(-1)).toBeNull();
    expect(getPlacement(NaN)).toBeNull();
  });
});
