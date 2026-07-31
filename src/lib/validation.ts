import { z } from "zod";
import { ACTIVE_GAME_IDS, GAME_IDS } from "../games/types";

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
    preferredGame: z.enum(ACTIVE_GAME_IDS).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    const category: Record<string, string> = {
      frequency_recall_v2: "sensory",
      colour_recall_v2: "sensory",
      time_recall: "sensory",
      shape_recall: "sensory",
      rhythm_recall: "sensory",
      memory_grid: "mind",
      dot_estimate: "mind",
      number_order: "mind",
      odd_one_out: "mind",
      pattern_complete: "mind",
      typing_sprint: "mind",
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

export const duelCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/);

export const privateDuelCreateSchema = z
  .object({
    selectionKind: z.enum(["game", "playlist"]),
    game: z.enum(ACTIVE_GAME_IDS).nullable().default(null),
    playlist: z.enum(["quick", "sensory", "mind", "experimental"]),
    bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
    ranked: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.selectionKind === "game" && value.game === null) {
      context.addIssue({
        code: "custom",
        path: ["game"],
        message: "Choose a game.",
      });
    }
    if (
      value.ranked &&
      (value.playlist === "experimental" ||
        value.game === "reaction_test" ||
        value.game === "target_tap")
    ) {
      context.addIssue({
        code: "custom",
        path: ["ranked"],
        message: "Experimental games are always unranked.",
      });
    }
  });

export const historyCursorSchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  beforeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const matchChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(280),
});

export const matchChatReportSchema = z.object({
  messageId: z.string().uuid(),
  reason: z.enum(["harassment", "spam", "personal_info", "other"]),
});

export const friendSearchSchema = z.object({
  query: z.string().trim().min(3).max(32),
});

export const publicCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^#/, "").toUpperCase())
  .pipe(z.string().regex(/^[A-F0-9]{6}$/));

export const friendRequestSchema = z.object({
  publicCode: publicCodeSchema,
});

export const friendResponseSchema = z.object({
  requestId: z.string().uuid(),
  accept: z.boolean(),
});

export const friendActionSchema = z.object({
  action: z.enum(["remove", "block"]),
  publicCode: publicCodeSchema,
});

export const duelInvitationSchema = privateDuelCreateSchema.and(
  z.object({ publicCode: publicCodeSchema }),
);

export const invitationResponseSchema = z.object({
  invitationId: z.string().uuid(),
  accept: z.boolean(),
});

export const onboardingSchema = z.object({
  completed: z.boolean(),
  skipped: z.boolean().default(false),
  recommendation: z.enum(["quick", "sensory", "mind"]).nullable().default(null),
});

export const cosmeticEquipSchema = z.object({
  cosmeticId: z.string().regex(/^[a-z0-9-]{3,64}$/),
});

export const analyticsEventNames = [
  "landing_viewed",
  "play_clicked",
  "anonymous_auth_created",
  "google_account_linked",
  "onboarding_started",
  "onboarding_completed",
  "queue_joined",
  "queue_broadened",
  "queue_cancelled",
  "practice_started",
  "human_match_found",
  "match_started",
  "match_completed",
  "match_abandoned",
  "rematch_requested",
  "private_duel_created",
  "private_duel_joined",
  "duel_invitation_sent",
  "friend_request_sent",
  "share_clicked",
  "history_viewed",
  "stats_viewed",
  "season_viewed",
  "returned_user",
] as const;

export const analyticsEventSchema = z.object({
  eventType: z.enum(analyticsEventNames),
  sessionId: z.string().uuid().nullable().default(null),
  gameType: z.enum(GAME_IDS).nullable().default(null),
  playlist: z.enum(["quick", "sensory", "mind", "experimental"]).nullable().default(null),
  matchId: z.string().uuid().nullable().default(null),
  deviceClass: z.enum(["mobile", "tablet", "desktop"]).nullable().default(null),
  referrerCategory: z.string().trim().max(64).nullable().default(null),
  experimentVariant: z.string().trim().max(64).nullable().default(null),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().default(null),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

export const clientErrorSchema = z.object({
  event: z.enum(["client_runtime_error", "realtime_disconnected"]).default("client_runtime_error"),
  message: z.string().min(1).max(500),
  route: z.string().max(200),
  digest: z.string().max(200).nullable().default(null),
  stack: z.string().max(2_000).nullable().default(null),
});

export const adminEnforcementSchema = z.object({
  publicCode: publicCodeSchema,
  state: z.enum([
    "normal",
    "warning",
    "ranked_restricted",
    "temporarily_suspended",
    "manually_banned",
  ]),
  reason: z.string().trim().min(3).max(500),
  durationMinutes: z.number().int().min(1).max(525_600).nullable().default(null),
});

export const adminInvalidateSchema = z.object({
  matchId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
