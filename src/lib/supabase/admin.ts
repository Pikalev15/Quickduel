import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requirePublicEnv, requireServerEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  const publicEnv = requirePublicEnv();
  const serverEnv = requireServerEnv();
  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
