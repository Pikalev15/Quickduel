import { describe, expect, it } from "vitest";
import { getGame } from "./registry";
import {
  colourRoundFeedback,
  colourRoundSubmissionSchema,
  frequencyRoundSubmissionSchema,
  frequencyRoundFeedback,
  recallRoundTarget,
  recallScoreLabel,
  wrappedHueDifference,
} from "./recall-rounds";

describe("secure recall round scoring", () => {
  it("reports exact frequency feedback without error", () => {
    expect(frequencyRoundFeedback(440, 440)).toEqual({
      kind: "frequency",
      targetHz: 440,
      guessHz: 440,
      differenceHz: 0,
      percentError: 0,
      centsError: 0,
      direction: "exact",
      score: 10,
      label: "Nearly exact",
    });
  });

  it("reports signed high and low pitch errors", () => {
    const high = frequencyRoundFeedback(440, 466);
    const low = frequencyRoundFeedback(440, 415);
    expect(high.direction).toBe("high");
    expect(high.differenceHz).toBeGreaterThan(0);
    expect(high.percentError).toBeGreaterThan(0);
    expect(high.centsError).toBeGreaterThan(0);
    expect(low.direction).toBe("low");
    expect(low.differenceHz).toBeLessThan(0);
    expect(low.percentError).toBeLessThan(0);
    expect(low.centsError).toBeLessThan(0);
  });

  it("gives a missing frequency answer zero without inventing an error", () => {
    const feedback = frequencyRoundFeedback(440, null);
    expect(feedback.score).toBe(0);
    expect(feedback.label).toBe("No answer");
    expect(feedback.guessHz).toBeNull();
    expect(feedback.centsError).toBeNull();
  });

  it("wraps colour hue differences across zero", () => {
    expect(wrappedHueDifference(350, 10)).toBe(20);
    expect(wrappedHueDifference(10, 350)).toBe(-20);
    expect(wrappedHueDifference(0, 180)).toBe(180);
  });

  it("reports perceptual colour components and a perfect score", () => {
    const target = { l: 62, c: 18, h: 350 };
    const exact = colourRoundFeedback(target, target);
    const shifted = colourRoundFeedback(target, { l: 65, c: 16, h: 10 });
    expect(exact.score).toBe(10);
    expect(exact.distance).toBe(0);
    expect(shifted.lightnessDifference).toBe(3);
    expect(shifted.chromaDifference).toBe(-2);
    expect(shifted.hueDifference).toBe(20);
    expect(shifted.distance).toBeGreaterThan(0);
    expect(shifted.score).toBeLessThan(10);
  });

  it("keeps per-round helpers identical to five-round registry scores", () => {
    const frequency = getGame("frequency_recall_v2");
    const frequencyChallenge = frequency.generate("round-consistency");
    const frequencyTargets = frequencyChallenge.frequencies as number[];
    const frequencyGuesses = frequencyTargets.map((target) => Math.round(target * 1.08));
    const frequencyResult = frequency.calculate(
      frequencyChallenge,
      { guessesHz: frequencyGuesses },
      30_000,
    );
    const expectedFrequency = frequencyTargets.reduce(
      (total, target, index) =>
        total + frequencyRoundFeedback(target, frequencyGuesses[index]).score,
      0,
    );
    expect(frequencyResult.rankScore).toBeCloseTo(expectedFrequency, 5);
    expect(frequencyResult.details.round1Target).toBe(frequencyTargets[0]);
    expect(frequencyResult.details.round1Guess).toBe(frequencyGuesses[0]);
    expect(frequencyResult.details.round5Score).toBeTypeOf("number");

    const colour = getGame("colour_recall_v2");
    const colourChallenge = colour.generate("round-consistency");
    const colourTargets = colourChallenge.colors as Array<{ l: number; c: number; h: number }>;
    const colourGuesses = colourTargets.map((target) => ({
      l: Math.min(90, target.l + 2),
      c: Math.max(4, target.c - 1),
      h: (target.h + 12) % 360,
    }));
    const colourResult = colour.calculate(
      colourChallenge,
      { colors: colourGuesses },
      40_000,
    );
    const expectedColour = colourTargets.reduce(
      (total, target, index) =>
        total + colourRoundFeedback(target, colourGuesses[index]).score,
      0,
    );
    expect(colourResult.rankScore).toBeCloseTo(expectedColour, 5);
    expect(colourResult.details.round1TargetL).toBe(colourTargets[0].l);
    expect(colourResult.details.round1GuessH).toBe(colourGuesses[0].h);
    expect(colourResult.details.round5Distance).toBeTypeOf("number");
  });

  it("extracts only the requested round target", () => {
    const game = getGame("frequency_recall_v2");
    const challenge = game.generate("target-projection");
    const targets = challenge.frequencies as number[];
    expect(recallRoundTarget("frequency_recall_v2", challenge, 3)).toBe(targets[3]);
  });

  it("rejects malformed and out-of-range single-round payloads", () => {
    expect(frequencyRoundSubmissionSchema.safeParse({ roundIndex: 5, answer: 440 }).success).toBe(false);
    expect(frequencyRoundSubmissionSchema.safeParse({ roundIndex: 1, answer: 20 }).success).toBe(false);
    expect(colourRoundSubmissionSchema.safeParse({
      roundIndex: 1,
      answer: { l: 60, c: 18, h: 360 },
    }).success).toBe(false);
    expect(colourRoundSubmissionSchema.safeParse({
      roundIndex: 1,
      answer: { l: 60, c: 18, h: 20, leaked: true },
    }).success).toBe(false);
  });

  it("uses stable competitive labels", () => {
    expect([10, 9, 7.5, 5, 0.1, 0].map(recallScoreLabel)).toEqual([
      "Nearly exact",
      "Very close",
      "Close",
      "Off",
      "Far off",
      "Far off",
    ]);
  });
});
