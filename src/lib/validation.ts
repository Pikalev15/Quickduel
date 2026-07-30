import { z } from "zod";
import { GAME_IDS } from "../games/types";

export const matchIdSchema = z.string().uuid();

export const selectedCellsSchema = z
  .array(z.number().int().min(0).max(63))
  .min(1)
  .max(32)
  .superRefine((cells, context) => {
    if (new Set(cells).size !== cells.length) {
      context.addIssue({
        code: "custom",
        message: "Selected cells must not contain duplicates.",
      });
    }
  });

export const submitAnswerSchema = z
  .object({
    submission: z.record(z.string(), z.unknown()),
    timedOut: z.boolean().optional().default(false),
  })
  .strict();

export const queueRequestSchema = z
  .object({
    playlist: z
      .enum(["quick", "sensory", "mind", "experimental"])
      .default("quick"),
    preferredGame: z.enum(GAME_IDS).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    const category: Record<string, string> = {
      frequency_recall: "sensory",
      colour_recall: "sensory",
      time_recall: "sensory",
      shape_recall: "sensory",
      rhythm_recall: "sensory",
      memory_grid: "mind",
      dot_estimate: "mind",
      number_order: "mind",
      odd_one_out: "mind",
      pattern_complete: "mind",
      reaction_test: "experimental",
      target_tap: "experimental",
    };
    if (
      value.preferredGame &&
      value.playlist !== "quick" &&
      category[value.preferredGame] !== value.playlist
    ) {
      context.addIssue({
        code: "custom",
        path: ["preferredGame"],
        message: "Preferred game must belong to the selected playlist.",
      });
    }
    if (
      value.playlist === "quick" &&
      value.preferredGame &&
      category[value.preferredGame] === "experimental"
    ) {
      context.addIssue({
        code: "custom",
        path: ["preferredGame"],
        message: "Experimental games are not part of Quick Play.",
      });
    }
  });

export const profileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(3)
      .max(24)
      .regex(/^[A-Za-z][A-Za-z0-9 _-]*$/),
    accentColour: z.enum(["volt", "cyan", "coral", "violet", "white"]),
  })
  .strict();

export const rematchRequestSchema = z.object({
  accept: z.literal(true),
});
