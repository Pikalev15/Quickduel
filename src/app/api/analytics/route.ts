import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson, rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { analyticsEventSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? analyticsEventSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Analytics event is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("analytics_events").insert({
      event_type: parsed.data.eventType,
      user_id: user?.id ?? null,
      session_id: parsed.data.sessionId,
      game_type: parsed.data.gameType,
      playlist: parsed.data.playlist,
      match_id: parsed.data.matchId,
      device_class: parsed.data.deviceClass,
      referrer_category: parsed.data.referrerCategory,
      experiment_variant: parsed.data.experimentVariant,
      duration_ms: parsed.data.durationMs,
      properties: parsed.data.properties,
    });
    if (error) throw error;
    if (user && parsed.data.eventType === "queue_cancelled") {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count } = await admin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("event_type", "queue_cancelled")
        .gte("occurred_at", since);
      if ((count ?? 0) >= 8) {
        const { count: recentFlags } = await admin
          .from("abuse_flags")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("signal", "repeated_queue_churn")
          .gte("created_at", since);
        if ((recentFlags ?? 0) === 0) {
          await admin.from("abuse_flags").insert({
            user_id: user.id,
            signal: "repeated_queue_churn",
            severity: 2,
            evidence: { window_minutes: 10, cancellations: count },
          });
        }
      }
    }
    return apiSuccess({ accepted: true }, 202, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/analytics");
  }
}
