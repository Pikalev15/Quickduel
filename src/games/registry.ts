import { z } from "zod";
import { createRandom, integer, round, shuffle } from "./random";
import type {
  Challenge,
  GameDefinition,
  GameId,
  GamePhase,
  GameResult,
  PlaylistId,
  Submission,
} from "./types";
import { GAME_IDS } from "./types";

const numberArray = (length: number, min: number, max: number) =>
  z.array(z.number().finite().min(min).max(max)).length(length);
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const hideDuringAnswer = (keys: string[]) => (challenge: Challenge, phase: GamePhase) => {
  if (phase === "reveal" || phase === "result") return challenge;
  return Object.fromEntries(Object.entries(challenge).filter(([key]) => !keys.includes(key)));
};
const alwaysPublic = (challenge: Challenge) => challenge;
const mean = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const result = (
  rankScore: number,
  accuracy: number,
  summary: string,
  details: GameResult["details"],
): GameResult => ({ rankScore: round(rankScore, 6), accuracy: round(clamp01(accuracy), 4), summary, details });
const botTime = (random: () => number, max: number) =>
  Math.round(max * (0.38 + random() * 0.35));

const memoryGrid: GameDefinition = {
  id: "memory_grid",
  version: 1,
  name: "Memory Grid",
  shortName: "Grid",
  category: "mind",
  description: "Memorize six charged cells, then recall them before the clock closes.",
  instructions: "Memorize the lit cells. Select every remembered cell; accuracy wins, speed breaks ties.",
  ranked: true,
  revealDurationMs: 1750,
  answerDurationMs: 8000,
  submissionSchema: object({
    selectedCells: z.array(z.number().int().min(0).max(15)).min(1).max(16),
  }).superRefine((value, context) => {
    if (new Set(value.selectedCells).size !== value.selectedCells.length) {
      context.addIssue({ code: "custom", message: "Cells must be unique." });
    }
  }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return {
      size: 4,
      highlightedCells: shuffle(random, Array.from({ length: 16 }, (_, index) => index)).slice(0, 6),
    };
  },
  publicChallenge: hideDuringAnswer(["highlightedCells"]),
  calculate(challenge, submission) {
    const expected = new Set(challenge.highlightedCells as number[]);
    const selected = submission.selectedCells as number[];
    const correct = selected.filter((cell) => expected.has(cell)).length;
    const incorrect = selected.length - correct;
    const missed = expected.size - correct;
    const score = correct - incorrect * 0.5;
    return result(score, correct / (correct + incorrect + missed), `${correct}/6 cells`, {
      correct,
      incorrect,
      missed,
    });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    const expected = challenge.highlightedCells as number[];
    const selected = expected.filter(() => random() > 0.16);
    if (selected.length === 0) selected.push(expected[0]);
    if (random() < 0.24) selected.push(integer(random, 0, 15));
    return { submission: { selectedCells: [...new Set(selected)] }, completionTimeMs: botTime(random, 8000) };
  },
};

const frequencyRecall: GameDefinition = {
  id: "frequency_recall",
  version: 1,
  name: "Frequency Recall",
  shortName: "Frequency",
  category: "sensory",
  description: "Hear three clean tones and rebuild their pitch contour.",
  instructions: "Listen to all three tones, then tune the three sliders. Lower proportional pitch error wins.",
  ranked: true,
  revealDurationMs: 2400,
  answerDurationMs: 12000,
  submissionSchema: object({ guessesHz: numberArray(3, 120, 2000) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return {
      frequencies: Array.from({ length: 3 }, () =>
        Math.round(120 * 2 ** (random() * Math.log2(2000 / 120))),
      ),
    };
  },
  publicChallenge: hideDuringAnswer(["frequencies"]),
  calculate(challenge, submission) {
    const expected = challenge.frequencies as number[];
    const guesses = submission.guessesHz as number[];
    const error = mean(expected.map((value, index) => Math.abs(Math.log2(guesses[index] / value))));
    return result(-error, 1 - error / 2, `${Math.round(error * 1200)} pitch-error`, { proportionalError: round(error, 4) });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    return {
      submission: { guessesHz: (challenge.frequencies as number[]).map((value) => Math.round(value * 2 ** ((random() - 0.5) * 0.32))) },
      completionTimeMs: botTime(random, 12000),
    };
  },
};

const colorSchema = object({
  l: z.number().finite().min(35).max(90),
  c: z.number().finite().min(4).max(32),
  h: z.number().finite().min(0).max(359),
});
const colourRecall: GameDefinition = {
  id: "colour_recall",
  version: 1,
  name: "Colour Recall",
  shortName: "Colour",
  category: "sensory",
  description: "Reconstruct three briefly shown colours in perceptual OKLCH space.",
  instructions: "Study the swatches, then match lightness, chroma, and hue. Lowest perceptual error wins.",
  ranked: true,
  revealDurationMs: 2600,
  answerDurationMs: 16000,
  submissionSchema: object({ colors: z.array(colorSchema).length(3) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return {
      colors: Array.from({ length: 3 }, () => ({
        l: integer(random, 45, 82),
        c: integer(random, 10, 28),
        h: integer(random, 0, 359),
      })),
    };
  },
  publicChallenge: hideDuringAnswer(["colors"]),
  calculate(challenge, submission) {
    const expected = challenge.colors as Array<{ l: number; c: number; h: number }>;
    const guesses = submission.colors as typeof expected;
    const distances = expected.map((color, index) => {
      const guess = guesses[index];
      const hue = Math.min(Math.abs(color.h - guess.h), 360 - Math.abs(color.h - guess.h)) / 180;
      return Math.sqrt(((color.l - guess.l) / 55) ** 2 + ((color.c - guess.c) / 28) ** 2 + hue ** 2);
    });
    const error = mean(distances);
    return result(-error, 1 - error / 1.5, `${Math.round(error * 100)} perceptual error`, { perceptualError: round(error, 4) });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    const colors = challenge.colors as Array<{ l: number; c: number; h: number }>;
    return {
      submission: {
        colors: colors.map((color) => ({
          l: Math.max(35, Math.min(90, color.l + integer(random, -8, 8))),
          c: Math.max(4, Math.min(32, color.c + integer(random, -5, 5))),
          h: (color.h + integer(random, -30, 30) + 360) % 360,
        })),
      },
      completionTimeMs: botTime(random, 16000),
    };
  },
};

const timeRecall: GameDefinition = {
  id: "time_recall",
  version: 1,
  name: "Time Recall",
  shortName: "Time",
  category: "sensory",
  description: "Internalize five visual pulse durations and reproduce their timing.",
  instructions: "Watch five pulses, then estimate each duration. Lowest log-ratio error wins.",
  ranked: true,
  revealDurationMs: 6500,
  answerDurationMs: 14000,
  submissionSchema: object({ durationsMs: numberArray(5, 700, 4000) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return { durations: Array.from({ length: 5 }, () => integer(random, 700, 4000)) };
  },
  publicChallenge: hideDuringAnswer(["durations"]),
  calculate(challenge, submission) {
    const expected = challenge.durations as number[];
    const guesses = submission.durationsMs as number[];
    const error = mean(expected.map((value, index) => Math.abs(Math.log(guesses[index] / value))));
    return result(-error, 1 - error, `${Math.round(error * 100)} timing error`, { logRatioError: round(error, 4) });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    return {
      submission: {
        durationsMs: (challenge.durations as number[]).map((value) =>
          Math.max(700, Math.min(4000, Math.round(value * (0.82 + random() * 0.36)))),
        ),
      },
      completionTimeMs: botTime(random, 14000),
    };
  },
};

const shapeRecall: GameDefinition = {
  id: "shape_recall",
  version: 1,
  name: "Shape Recall",
  shortName: "Shape",
  category: "sensory",
  description: "Rebuild a six-point radial silhouette from memory.",
  instructions: "Study the shape, then tune its six points. Lowest mean radial error wins.",
  ranked: true,
  revealDurationMs: 2600,
  answerDurationMs: 14000,
  submissionSchema: object({ radii: numberArray(6, 10, 90) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return { radii: Array.from({ length: 6 }, () => integer(random, 18, 88)) };
  },
  publicChallenge: hideDuringAnswer(["radii"]),
  calculate(challenge, submission) {
    const expected = challenge.radii as number[];
    const guesses = submission.radii as number[];
    const errors = expected.map((value, index) => Math.abs(value - guesses[index]) / 80);
    const avg = mean(errors);
    const max = Math.max(...errors);
    return result(-(avg + max * 0.05), 1 - avg, `${Math.round(avg * 100)}% radial error`, { meanError: round(avg, 4), maxError: round(max, 4) });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    return {
      submission: { radii: (challenge.radii as number[]).map((value) => Math.max(10, Math.min(90, value + integer(random, -14, 14)))) },
      completionTimeMs: botTime(random, 14000),
    };
  },
};

function rhythmIntervals(taps: number[]) {
  return taps.slice(1).map((value, index) => value - taps[index]);
}
const rhythmRecall: GameDefinition = {
  id: "rhythm_recall",
  version: 1,
  name: "Rhythm Recall",
  shortName: "Rhythm",
  category: "sensory",
  description: "Hear three short rhythms and tap their relative timing.",
  instructions: "Listen, then tap each rhythm. Relative interval accuracy wins; total duration is secondary.",
  ranked: true,
  revealDurationMs: 6500,
  answerDurationMs: 20000,
  submissionSchema: object({
    tapsMs: z.array(z.array(z.number().finite().min(0).max(10000)).min(5).max(7)).length(3),
  }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return {
      rhythms: Array.from({ length: 3 }, () => {
        const count = integer(random, 5, 7);
        const intervals = Array.from({ length: count - 1 }, () => integer(random, 180, 620));
        return intervals.reduce<number[]>((values, interval) => [...values, values.at(-1)! + interval], [0]);
      }),
    };
  },
  publicChallenge: hideDuringAnswer(["rhythms"]),
  calculate(challenge, submission) {
    const expected = challenge.rhythms as number[][];
    const taps = submission.tapsMs as number[][];
    const relativeErrors = expected.map((rhythm, index) => {
      const target = rhythmIntervals(rhythm);
      const guess = rhythmIntervals(taps[index]);
      const targetMean = mean(target);
      const guessMean = mean(guess);
      return mean(target.map((value, cursor) => Math.abs(value / targetMean - (guess[cursor] ?? guessMean) / guessMean)));
    });
    const durationError = mean(expected.map((rhythm, index) =>
      Math.abs((taps[index].at(-1) ?? 0) / (rhythm.at(-1) ?? 1) - 1),
    ));
    const relative = mean(relativeErrors);
    return result(-(relative + durationError * 0.05), 1 - relative, `${Math.round(relative * 100)} rhythm error`, {
      relativeIntervalError: round(relative, 4),
      durationError: round(durationError, 4),
    });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    return {
      submission: {
        tapsMs: (challenge.rhythms as number[][]).map((rhythm) =>
          rhythm.map((value) => Math.max(0, value + integer(random, -70, 70))),
        ),
      },
      completionTimeMs: botTime(random, 20000),
    };
  },
};

const dotEstimate: GameDefinition = {
  id: "dot_estimate",
  version: 1,
  name: "Dot Estimate",
  shortName: "Dots",
  category: "mind",
  description: "Estimate a dense field without counting every dot.",
  instructions: "Study the field, then estimate the count. Smallest absolute error wins.",
  ranked: true,
  revealDurationMs: 2200,
  answerDurationMs: 7000,
  submissionSchema: object({ estimate: z.number().int().min(20).max(150) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    const count = integer(random, 35, 120);
    return {
      count,
      dots: Array.from({ length: count }, () => ({
        x: round(3 + random() * 94, 2),
        y: round(3 + random() * 94, 2),
        r: integer(random, 3, 7),
      })),
    };
  },
  publicChallenge(challenge, phase) {
    if (phase === "reveal" || phase === "result") return challenge;
    return {};
  },
  calculate(challenge, submission) {
    const error = Math.abs(Number(submission.estimate) - Number(challenge.count));
    return result(-error, 1 - error / 100, `${error} dots off`, { absoluteError: error, target: Number(challenge.count) });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    const count = Number(challenge.count);
    return { submission: { estimate: Math.max(20, Math.min(150, count + integer(random, -14, 14))) }, completionTimeMs: botTime(random, 7000) };
  },
};

const numberOrder: GameDefinition = {
  id: "number_order",
  version: 1,
  name: "Number Order",
  shortName: "Order",
  category: "mind",
  description: "Clear ten scattered numbers from lowest to highest.",
  instructions: "Tap all numbers in ascending order. Errors add a 750ms penalty.",
  ranked: true,
  revealDurationMs: 0,
  answerDurationMs: 12000,
  submissionSchema: object({ order: z.array(z.number().int().min(0).max(9)).length(10) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    const values = shuffle(random, Array.from({ length: 10 }, (_, index) => index + integer(random, 1, 5) * 10));
    return {
      numbers: values.map((value, index) => ({
        value,
        x: 8 + (index % 5) * 20 + random() * 7,
        y: 10 + Math.floor(index / 5) * 48 + random() * 20,
      })),
    };
  },
  publicChallenge: alwaysPublic,
  calculate(challenge, submission, completionTimeMs) {
    const numbers = challenge.numbers as Array<{ value: number }>;
    const order = submission.order as number[];
    const expected = numbers.map((_, index) => index).sort((a, b) => numbers[a].value - numbers[b].value);
    const errors = order.filter((value, index) => value !== expected[index]).length;
    const adjusted = completionTimeMs + errors * 750;
    return result(-adjusted, 1 - errors / 10, `${(adjusted / 1000).toFixed(2)}s adjusted`, { errors, adjustedTimeMs: adjusted });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    const numbers = challenge.numbers as Array<{ value: number }>;
    const order = numbers.map((_, index) => index).sort((a, b) => numbers[a].value - numbers[b].value);
    if (random() < 0.3) [order[7], order[8]] = [order[8], order[7]];
    return { submission: { order }, completionTimeMs: botTime(random, 12000) };
  },
};

const oddOneOut: GameDefinition = {
  id: "odd_one_out",
  version: 1,
  name: "Odd One Out",
  shortName: "Odd",
  category: "mind",
  description: "Spot the single rotated symbol in a packed field.",
  instructions: "Find the odd tile. Correctness wins; trusted completion time breaks correct ties.",
  ranked: true,
  revealDurationMs: 0,
  answerDurationMs: 6000,
  submissionSchema: object({ selectedIndex: z.number().int().min(0).max(24) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    const glyphs = ["◆", "▲", "✚", "⬢"];
    return { tileCount: 16, oddIndex: integer(random, 0, 15), glyph: glyphs[integer(random, 0, glyphs.length - 1)], showAnswer: true };
  },
  publicChallenge: alwaysPublic,
  calculate(challenge, submission) {
    const correct = Number(submission.selectedIndex) === Number(challenge.oddIndex);
    return result(correct ? 1 : 0, correct ? 1 : 0, correct ? "Correct target" : "Wrong target", { correct });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    return { submission: { selectedIndex: random() > 0.18 ? challenge.oddIndex : integer(random, 0, 15) }, completionTimeMs: botTime(random, 6000) };
  },
};

const patternComplete: GameDefinition = {
  id: "pattern_complete",
  version: 1,
  name: "Pattern Complete",
  shortName: "Pattern",
  category: "mind",
  description: "Resolve six compact symbol sequences under pressure.",
  instructions: "Choose the missing item in each sequence. Correct count wins, then time.",
  ranked: true,
  revealDurationMs: 0,
  answerDurationMs: 18000,
  submissionSchema: object({ answers: z.array(z.number().int().min(0).max(3)).length(6) }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    const symbols = ["●", "■", "▲", "◆"];
    return {
      puzzles: Array.from({ length: 6 }, (_, puzzle) => {
        const offset = integer(random, 0, 3);
        const sequence = Array.from({ length: 4 }, (_, index) => symbols[(index + offset + puzzle) % 4]);
        return { sequence: [...sequence, "?"], options: shuffle(random, symbols), answer: sequence[0] };
      }),
    };
  },
  publicChallenge(challenge) {
    return {
      puzzles: (challenge.puzzles as Array<Record<string, unknown>>).map((puzzle) =>
        Object.fromEntries(Object.entries(puzzle).filter(([key]) => key !== "answer")),
      ),
    };
  },
  calculate(challenge, submission) {
    const puzzles = challenge.puzzles as Array<{ options: string[]; answer: string }>;
    const answers = submission.answers as number[];
    const correct = puzzles.filter((puzzle, index) => puzzle.options[answers[index]] === puzzle.answer).length;
    return result(correct, correct / 6, `${correct}/6 patterns`, { correct, incorrect: 6 - correct });
  },
  bot(seed, challenge) {
    const random = createRandom(`${seed}:bot`);
    const puzzles = challenge.puzzles as Array<{ options: string[]; answer: string }>;
    return {
      submission: { answers: puzzles.map((puzzle) => random() > 0.2 ? puzzle.options.indexOf(puzzle.answer) : integer(random, 0, 3)) },
      completionTimeMs: botTime(random, 18000),
    };
  },
};

const reactionTest: GameDefinition = {
  id: "reaction_test",
  version: 1,
  name: "Reaction Test",
  shortName: "Reaction",
  category: "experimental",
  description: "Five randomized go-signals test raw response latency.",
  instructions: "Wait for green, then click. False starts receive a 1000ms trial.",
  ranked: false,
  revealDurationMs: 0,
  answerDurationMs: 18000,
  submissionSchema: object({
    reactionTimesMs: numberArray(5, 0, 2000),
    falseStarts: z.number().int().min(0).max(5),
  }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return { waits: Array.from({ length: 5 }, () => integer(random, 800, 2200)) };
  },
  publicChallenge: alwaysPublic,
  calculate(_challenge, submission) {
    const times = submission.reactionTimesMs as number[];
    const average = mean(times);
    return result(-average, 1 - average / 1000, `${Math.round(average)}ms average`, { averageMs: Math.round(average), falseStarts: Number(submission.falseStarts) });
  },
  bot(seed) {
    const random = createRandom(`${seed}:bot`);
    const times = Array.from({ length: 5 }, () => integer(random, 230, 430));
    return { submission: { reactionTimesMs: times, falseStarts: 0 }, completionTimeMs: times.reduce((a, b) => a + b, 0) };
  },
};

const targetTap: GameDefinition = {
  id: "target_tap",
  version: 1,
  name: "Target Tap",
  shortName: "Targets",
  category: "experimental",
  description: "Strike twelve deterministic targets with minimal misses.",
  instructions: "Tap each target as it appears. Misses add a 350ms penalty.",
  ranked: false,
  revealDurationMs: 0,
  answerDurationMs: 16000,
  submissionSchema: object({
    hitCount: z.number().int().min(0).max(12),
    misses: z.number().int().min(0).max(100),
    elapsedMs: z.number().int().min(0).max(30000),
  }) as z.ZodType<Submission>,
  generate(seed) {
    const random = createRandom(seed);
    return { targets: Array.from({ length: 12 }, () => ({ x: 8 + random() * 84, y: 12 + random() * 76 })) };
  },
  publicChallenge: alwaysPublic,
  calculate(_challenge, submission) {
    const hits = Number(submission.hitCount);
    const misses = Number(submission.misses);
    const adjusted = Number(submission.elapsedMs) + misses * 350 + (12 - hits) * 1500;
    return result(-adjusted, hits / Math.max(12, hits + misses), `${(adjusted / 1000).toFixed(2)}s adjusted`, { hits, misses, adjustedTimeMs: adjusted });
  },
  bot(seed) {
    const random = createRandom(`${seed}:bot`);
    const misses = integer(random, 0, 3);
    const elapsedMs = integer(random, 4200, 7200);
    return { submission: { hitCount: 12, misses, elapsedMs }, completionTimeMs: elapsedMs };
  },
};

export const gameRegistry = new Map<GameId, GameDefinition>(
  [
    memoryGrid,
    frequencyRecall,
    colourRecall,
    timeRecall,
    shapeRecall,
    rhythmRecall,
    dotEstimate,
    numberOrder,
    oddOneOut,
    patternComplete,
    reactionTest,
    targetTap,
  ].map((game) => [game.id, game]),
);

export function getGame(gameId: string): GameDefinition {
  const game = gameRegistry.get(gameId as GameId);
  if (!game) throw new Error(`Unknown game: ${gameId}`);
  return game;
}

export const playlistGames: Record<PlaylistId, GameId[]> = {
  quick: GAME_IDS.filter((id) => getGame(id).ranked),
  sensory: GAME_IDS.filter((id) => getGame(id).category === "sensory"),
  mind: GAME_IDS.filter((id) => getGame(id).category === "mind"),
  experimental: GAME_IDS.filter((id) => getGame(id).category === "experimental"),
};

export function pickGame(seed: string, playlist: PlaylistId, preferredGame?: GameId | null) {
  if (preferredGame && playlistGames[playlist].includes(preferredGame)) return preferredGame;
  const choices = playlistGames[playlist];
  const random = createRandom(seed);
  return choices[Math.floor(random() * choices.length)];
}
