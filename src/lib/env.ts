import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function getPublicEnv(): PublicEnv | null {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  });
  return result.success ? result.data : null;
}

export function requirePublicEnv() {
  const env = getPublicEnv();
  if (!env) {
    throw new Error(
      "QuickDuel backend is not configured. Copy .env.example to .env.local and add the two public Supabase values.",
    );
  }
  return env;
}

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
});

export function requireServerEnv() {
  const result = serverEnvSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  if (!result.success) {
    throw new Error(
      "Ranked game scoring is not configured. Add SUPABASE_SECRET_KEY to the server environment.",
    );
  }
  return result.data;
}
