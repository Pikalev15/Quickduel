import {apiSuccess,requestCorrelationId} from "@/lib/api";
import {requireUser} from "@/lib/server/route";
import {rpcErrorResponse} from "@/lib/server/http";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const id=requestCorrelationId(request);
 try{const {supabase}=await requireUser();const {data,error}=await supabase.rpc("get_my_skill_progress");if(error)throw error;const response=apiSuccess(data,200,id);response.headers.set("Cache-Control","private, no-store");return response;}catch(error){return rpcErrorResponse(error,id,"/api/progression");}
}
