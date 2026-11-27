import {apiError,apiSuccess,requestCorrelationId} from "@/lib/api";
import {requireUser} from "@/lib/server/route";
import {rpcErrorResponse} from "@/lib/server/http";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {enforceNetworkAbuseBoundary} from "@/lib/server/network-abuse";
import {DAILY_DURATION_MS,dailyDate,dailyRequestSchema,dailyPublicChallenge,scoreDaily,dailyLeaderboard} from "@/games/daily-duel";
export const dynamic="force-dynamic";
function noStore<T extends Response>(response:T){response.headers.set("Cache-Control","private, no-store");return response;}
function unavailable(id:string){return noStore(apiError(503,"BACKEND_NOT_CONFIGURED","Daily Duel is not available yet. Please try again later.",undefined,id));}
async function ownAttempt(db:ReturnType<typeof createSupabaseAdminClient>,date:string,id:string){
 const res=await db.from("daily_duel_attempts").select("deadline,completed_at,score").eq("challenge_date",date).eq("user_id",id).maybeSingle();
 if(res.error)throw res.error;return res.data;
}
export async function GET(request:Request){
 const id=requestCorrelationId(request),date=dailyDate();
 try{
  const db=createSupabaseAdminClient();
  const board=await db.from("daily_duel_attempts").select("score,profiles!inner(display_name,deleted_at)").eq("challenge_date",date).not("completed_at","is",null).is("profiles.deleted_at",null).order("score",{ascending:false}).limit(100);
  if(board.error)return unavailable(id);
  const client=await createSupabaseServerClient(),auth=await client.auth.getUser();
  const own=auth.data.user?await ownAttempt(db,date,auth.data.user.id):null;
  const rows=(board.data??[]).flatMap(row=>{
   const profile=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;
   return profile&&typeof row.score==="number"?[{name:String(profile.display_name),score:row.score}]:[];
  });
  return noStore(apiSuccess({date,durationMs:DAILY_DURATION_MS,leaderboard:dailyLeaderboard(rows),attempt:own?{status:own.completed_at?"complete":Date.parse(own.deadline)>Date.now()?"active":"expired",score:own.score}:null},200,id));
 }catch(error){return noStore(rpcErrorResponse(error,id,"/api/daily"));}
}
export async function POST(request:Request){
 const id=requestCorrelationId(request),receivedAt=new Date().toISOString();
 const parsed=dailyRequestSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return noStore(apiError(400,"INVALID_REQUEST","Invalid daily challenge request.",undefined,id));
 try{
  const {user,supabase}=await requireUser();
  await enforceNetworkAbuseBoundary(request,"daily_"+parsed.data.action,30,60,{adaptiveChallenge:false});
  const db=createSupabaseAdminClient();
  const profile=await db.from("profiles").select("id,deleted_at,account_state").eq("id",user.id).maybeSingle();
  if(profile.error)throw profile.error;
  if(!profile.data||profile.data.deleted_at||profile.data.account_state!=="normal")return noStore(apiError(403,"FORBIDDEN","An active player profile is required.",undefined,id));
  const rate=await supabase.rpc("check_rate_limit",{requested_action:"daily_duel",requested_limit:20,requested_window_seconds:60});
  if(rate.error)return noStore(apiError(429,"RATE_LIMITED","Too many daily challenge requests.",undefined,id));
  const date=parsed.data.action==="start"?dailyDate():parsed.data.date;
  if(parsed.data.action==="start"){
   const created=await db.from("daily_duel_challenges").upsert({challenge_date:date},{onConflict:"challenge_date",ignoreDuplicates:true});
   if(created.error)return unavailable(id);
   const started=await db.from("daily_duel_attempts").upsert({challenge_date:date,user_id:user.id},{onConflict:"challenge_date,user_id",ignoreDuplicates:true});
   if(started.error)throw started.error;
  }
  const attempt=await ownAttempt(db,date,user.id);
  if(!attempt)return noStore(apiError(404,"NOT_FOUND","Start the challenge first.",undefined,id));
  if(attempt.completed_at)return noStore(apiSuccess({date,status:"complete",score:attempt.score},200,id));
  if(Date.parse(attempt.deadline)+(parsed.data.action==="submit"?1000:0)<Date.now())return noStore(apiSuccess({date,status:"expired",score:null},200,id));
  const challenge=await db.from("daily_duel_challenges").select("seed,game_version").eq("challenge_date",date).single();
  if(challenge.error)throw challenge.error;
  if(challenge.data.game_version!==1)return unavailable(id);
  if(parsed.data.action==="start")return noStore(apiSuccess({date,status:"active",deadline:attempt.deadline,challenge:dailyPublicChallenge(challenge.data.seed),serverReceivedAt:receivedAt,serverNow:new Date().toISOString()},200,id));
  const score=scoreDaily(challenge.data.seed,parsed.data.answers);
  const finished=await db.rpc("finish_daily_duel",{requested_date:date,requested_user:user.id,calculated_score:score});
  if(finished.error)throw finished.error;
  return noStore(apiSuccess({date,status:typeof finished.data==="number"?"complete":"expired",score:finished.data??null},200,id));
 }catch(error){return noStore(rpcErrorResponse(error,id,"/api/daily"));}
}
