import { z } from "zod";

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

export const submitAnswerSchema = z.object({
  selectedCells: selectedCellsSchema,
});

export const queueRequestSchema = z.object({}).strict();

export const rematchRequestSchema = z.object({
  accept: z.literal(true),
});
