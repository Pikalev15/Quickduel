import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, {params}: {params: Promise<{code:string}>}) {
  const {code} = await params;
  const headers = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if (!/^[A-F0-9]{6}$/.test(code)) return new Response(null,{status:404,headers});
  try {
    const {data,error} = await createSupabaseAdminClient().from("player_avatars")
      .select("image,profiles!inner(public_code,deleted_at)")
      .eq("profiles.public_code",code).is("profiles.deleted_at",null).maybeSingle();
    if (error) return new Response(null,{status:503,headers});
    if (!data?.image) return new Response(null,{status:404,headers});
    return new Response(Uint8Array.from(Buffer.from(data.image,"base64")),{headers:{...headers,"Content-Type":"image/webp"}});
  } catch {
    return new Response(null,{status:503,headers});
  }
}
