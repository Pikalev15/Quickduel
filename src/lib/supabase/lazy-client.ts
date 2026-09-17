import type { SupabaseClient } from "@supabase/supabase-js";

let clientPromise: Promise<SupabaseClient | null> | undefined;

export function loadSupabaseBrowserClient() {
  clientPromise ??= import("./client").then(({ getSupabaseBrowserClient }) =>
    getSupabaseBrowserClient(),
  );
  return clientPromise;
}
