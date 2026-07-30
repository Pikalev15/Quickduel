import { apiSuccess } from "@/lib/api";
import { requirePublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = requirePublicEnv();
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
    });
    const settings = (await response.json()) as {
      external?: { google?: boolean; anonymous_users?: boolean };
    };
    return apiSuccess({
      google: settings.external?.google === true,
      anonymous: settings.external?.anonymous_users === true,
    });
  } catch {
    return apiSuccess({ google: false, anonymous: true });
  }
}
