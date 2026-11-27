import { z } from "zod";
import { CUSTOM_TIMING_GAMES, validWorkshop, workshopSchema } from "./match-rules";

const PREFIX = "QD1:";
export const MAX_WORKSHOP_PRESET_LENGTH = 1024;

const presetSchema = z.object({
  game: z.enum(CUSTOM_TIMING_GAMES),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  rules: workshopSchema,
}).strict().refine(preset => validWorkshop(preset.game, preset.rules), {
  message: "Rules are incompatible with the selected game.",
});

export type SharedWorkshopPreset = z.infer<typeof presetSchema>;

export function encodeWorkshopPreset(value: unknown): string | null {
  const parsed = presetSchema.safeParse(value);
  if (!parsed.success) return null;
  const code = PREFIX + JSON.stringify(parsed.data);
  return code.length <= MAX_WORKSHOP_PRESET_LENGTH ? code : null;
}

export function decodeWorkshopPreset(code: string): SharedWorkshopPreset | null {
  if (code.length > MAX_WORKSHOP_PRESET_LENGTH) return null;
  const value = code.trim();
  if (!value.startsWith(PREFIX)) return null;
  try {
    const parsed = presetSchema.safeParse(JSON.parse(value.slice(PREFIX.length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
