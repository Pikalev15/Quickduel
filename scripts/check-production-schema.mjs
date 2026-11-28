import { createClient } from "@supabase/supabase-js";

if (process.env.VERCEL_ENV === "production") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Production build blocked: Supabase configuration is missing.");
    process.exit(1);
  }
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.rpc("get_workshop_release_status").abortSignal(AbortSignal.timeout(10000));
    if (error || data?.schemaVersion !== 1 || data?.prepared !== true) {
      throw new Error("Workshop schema is not prepared.");
    }
    console.log("Production schema preflight passed.");
  } catch {
    console.error("Production build blocked: Workshop schema expansion has not been verified.");
    process.exit(1);
  }
}
