import { apiError,apiSuccess,requestCorrelationId } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const id=requestCorrelationId(request);
  try {
    const {supabase}=await requireUser();
    const role=await supabase.rpc("is_admin",{requested_roles:["admin"]});
    if(role.error||role.data!==true)return apiError(403,"FORBIDDEN","Admin access required.",undefined,id);
    const db=createSupabaseAdminClient();
    const now=new Date().toISOString();
    const day=new Date(Date.now()-86400000).toISOString();
    const week=new Date(Date.now()-7*86400000).toISOString();
    const profileCount=()=>db.from("profiles").select("id",{count:"exact",head:true}).is("deleted_at",null);
    const matches=()=>db.from("matches").select("id",{count:"exact",head:true});
    const queries={
      "Accounts":profileCount(),
      "New accounts (24h)":profileCount().gte("created_at",day),
      "New accounts (7d)":profileCount().gte("created_at",week),
      "Active accounts (24h)":profileCount().gte("last_active_at",day),
      "Active accounts (7d)":profileCount().gte("last_active_at",week),
      "Unranked accounts":profileCount().lt("matches_played",5),
      "Placed accounts":profileCount().gte("matches_played",5),
      "Restricted accounts":profileCount().neq("account_state","normal"),
      "All human matches":matches(),
      "Completed matches":matches().eq("status","completed"),
      "Abandoned matches":matches().eq("status","abandoned"),
      "Ranked matches completed":matches().eq("status","completed").eq("ranked",true).is("invalidated_at",null),
      "Invalidated matches":matches().not("invalidated_at","is",null),
      "Live queue entries":db.from("matchmaking_queue").select("user_id",{count:"exact",head:true}).gt("expires_at",now),
      "Pending friend requests":db.from("friend_requests").select("id",{count:"exact",head:true}).eq("status","pending"),
      "Pending duel invitations":db.from("duel_invitations").select("id",{count:"exact",head:true}).eq("status","pending").gt("expires_at",now),
      "Private lobbies created":db.from("private_duels").select("id",{count:"exact",head:true}),
      "Private lobbies (24h)":db.from("private_duels").select("id",{count:"exact",head:true}).gte("created_at",day),
      "Block relationships":db.from("user_blocks").select("blocker_id",{count:"exact",head:true}),
      "Analytics events (24h)":db.from("analytics_events").select("id",{count:"exact",head:true}).gte("occurred_at",day),
    };
    const [counts,recentPlayers,recentMatches]=await Promise.all([
      Promise.all(Object.entries(queries).map(async ([label,query])=>{const res=await query;return [label,res.error?null:res.count] as const;})),
      db.from("profiles").select("display_name,public_code,rating,matches_played,wins,losses,draws,account_state,created_at,last_active_at").is("deleted_at",null).order("created_at",{ascending:false}).limit(50),
      db.from("matches").select("id,game_type,status,source,ranked,completion_reason,created_at,completed_at,invalidated_at").order("created_at",{ascending:false}).limit(50),
    ]);
    const response=apiSuccess({asOf:now,counts:Object.fromEntries(counts),players:recentPlayers.error?null:recentPlayers.data,matches:recentMatches.error?null:recentMatches.data},200,id);
    response.headers.set("Cache-Control","private, no-store");
    return response;
  } catch(error){return rpcErrorResponse(error,id,"/api/admin/operations");}
}
