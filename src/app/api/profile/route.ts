import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { profileUpdateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_my_profile");
    if (error) throw error;
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = profileUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Profile details are invalid.", parsed.error.issues);
    }
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("update_profile", {
      requested_display_name: parsed.data.displayName,
      requested_accent_colour: parsed.data.accentColour,
    });
    if (error) return apiError(409, "CONFLICT", error.message);
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
