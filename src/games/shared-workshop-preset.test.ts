import { describe, expect, it } from "vitest";
import { CUSTOM_TIMING_GAMES, supportsCustomReveal } from "./match-rules";
import { decodeWorkshopPreset, encodeWorkshopPreset, MAX_WORKSHOP_PRESET_LENGTH } from "./shared-workshop-preset";

const memory = { game: "memory_grid", bestOf: 3, rules: { version: 1, answerMs: 10000, revealMs: 4000, memory: { size: 6, tiles: 8, ordered: true } } };

describe("portable Workshop presets", () => {
  it("round-trips all supported games, including ordered memory", () => {
    for (const game of CUSTOM_TIMING_GAMES) {
      const preset = game === "memory_grid" ? memory : {
        game, bestOf: 5, rules: { version: 1, answerMs: 10000, revealMs: game === "rhythm_recall" ? 13000 : supportsCustomReveal(game) ? 2000 : 0 },
      };
      const code = encodeWorkshopPreset(preset);
      expect(code).not.toBeNull();
      expect(decodeWorkshopPreset(" " + code + "\n")).toEqual(preset);
    }
  });

  it("rejects unsupported games, invalid rules, and injected flags", () => {
    const invalid = [
      { ...memory, game: "frequency_recall_v2" },
      { ...memory, game: "shape_recall" },
      { ...memory, bestOf: 2 },
      { ...memory, ranked: true },
      { ...memory, seed: "secret" },
      { ...memory, rules: { ...memory.rules, answerMs: 1 } },
      { ...memory, rules: { ...memory.rules, revealMs: 500 } },
      { ...memory, rules: { ...memory.rules, version: 2 } },
      { ...memory, rules: { ...memory.rules, memory: { size: 3, tiles: 9, ordered: false } } },
    ];
    for (const preset of invalid) {
      expect(encodeWorkshopPreset(preset)).toBeNull();
      expect(decodeWorkshopPreset("QD1:" + JSON.stringify(preset))).toBeNull();
    }
  });

  it("rejects malformed, unknown-version and oversized codes", () => {
    for (const code of ["", "QD1:{", "QD2:" + JSON.stringify(memory), "QD1:null", "QD1:[]", " ".repeat(MAX_WORKSHOP_PRESET_LENGTH + 1)]) {
      expect(decodeWorkshopPreset(code)).toBeNull();
    }
  });
});
