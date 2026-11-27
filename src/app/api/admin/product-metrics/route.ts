import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildProductMetrics, type ProductEvent, type ProductMatch } from "@/lib/product-metrics";

export const dynamic = "force-dynamic";
const PAGE = 500;
const LIMIT = 20000;
type PageResult<T> = { data: T[] | null; error: unknown };
async function collect<T>(getPage: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; from <= LIMIT; from += PAGE) {
    const page = await getPage(from,from+PAGE-1);
    if (page.error) throw page.error;
    const rows = page.data ?? [];
    result.push(...rows);
    if (result.length > LIMIT) throw new Error("Report exceeds bounded preview capacity.");
    if (rows.length < PAGE) return result;
  }
  throw new Error("Report exceeds bounded preview capacity.");
}

export async function GET(request: Request) {
  const id = requestCorrelationId(request);
  try {
    const { supabase } = await requireUser();
    const role = await supabase.rpc("is_admin",{requested_roles:["admin","analyst"]});
    if (role.error || role.data !== true) return apiError(403,"FORBIDDEN","Analytics access required.",undefined,id);
    const parameter = new URL(request.url).searchParams.get("days") ?? "7";
    if (parameter !== "7" && parameter !== "30") return apiError(400,"INVALID_REQUEST","Choose 7 or 30 days.",undefined,id);
    const days = Number(parameter);
    const now = Date.now();
    const today = Math.floor(now / 86_400_000)*86_400_000;
    const since = new Date(today - (days - 1)*86_400_000).toISOString();
    const lookback = new Date(today - (days + 29)*86_400_000).toISOString();
    const until = new Date(now).toISOString();
    const admin = createSupabaseAdminClient();
    const [events,matches,eligible,started,placed] = await Promise.all([
      collect<ProductEvent>((from,to)=>admin.from("analytics_events").select("event_type,user_id,session_id,game_type,match_id,device_class,duration_ms,occurred_at").gte("occurred_at",lookback).lte("occurred_at",until).order("id").range(from,to)),
      collect<ProductMatch>((from,to)=>admin.from("matches").select("game_type,status,starts_at,completion_reason").is("invalidated_at",null).gte("starts_at",since).lte("starts_at",until).order("id").range(from,to)),
      admin.from("profiles").select("id",{count:"exact",head:true}).is("deleted_at",null),
      admin.from("profiles").select("id",{count:"exact",head:true}).is("deleted_at",null).gte("matches_played",1),
      admin.from("profiles").select("id",{count:"exact",head:true}).is("deleted_at",null).gte("matches_played",5),
    ]);
    for (const count of [eligible,started,placed]) if (count.error) throw count.error;
    const response = apiSuccess(buildProductMetrics(events,matches,now,days,{eligible:eligible.count??0,started:started.count??0,placed:placed.count??0}),200,id);
    response.headers.set("Cache-Control","private, no-store");
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes("bounded preview capacity")) return apiError(503,"SERVER_ERROR","Too much data for this report. Choose a shorter range.",undefined,id);
    return rpcErrorResponse(error,id,"/api/admin/product-metrics");
  }
}
