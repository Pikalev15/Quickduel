import {apiSuccess,requestCorrelationId} from "@/lib/api";
import {requireUser} from "@/lib/server/route";
import {rpcErrorResponse} from "@/lib/server/http";
export async function POST(request:Request){const id=requestCorrelationId(request);try{const {supabase}=await requireUser();const {data,error}=await supabase.rpc("claim_skill_rewards");if(error)throw error;return apiSuccess(data,200,id);}catch(error){return rpcErrorResponse(error,id,"/api/cosmetics/achievements");}}
