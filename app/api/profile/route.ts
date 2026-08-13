import { NextResponse } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { getProfile, updateProfile } from "@/lib/server/profile/profile.service";
import { updateProfileSchema } from "@/types/profile";
import { ValidationError } from "@/lib/server/shared/errors";
import type { ApiResponse } from "@/types/api";
import type { Profile, ProfileWithTimestamps } from "@/types/profile";
import { ErrorCode } from "@/types/errors";

// Force dynamic so session cookies are always read fresh.
export const dynamic = "force-dynamic";

/**
 * GET /api/profile
 *
 * Returns the authenticated user's profile.
 *
 * 200 { data: { id, display_name, avatar_url } }
 * 401 Not authenticated
 * 404 Profile row does not exist yet (Phase 3 trigger not run)
 */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  return withErrorHandling(
    async () => {
      const profile = await getProfile(user.id);
      const body: ApiResponse<Profile> = { data: profile, error: null };
      return NextResponse.json(body, { status: 200 });
    },
    { userId: user.id, route: "GET /api/profile" },
  );
}

/**
 * PATCH /api/profile
 *
 * Updates the authenticated user's display_name.
 *
 * Request body: { display_name: string }
 *
 * 200 { data: { id, display_name, avatar_url, updated_at } }
 * 400 Zod validation failed (empty or > 50 chars)
 * 401 Not authenticated
 */
export async function PATCH(request: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  return withErrorHandling(
    async () => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        const body: ApiResponse<never> = {
          data: null,
          error: { code: ErrorCode.VALIDATION_ERROR, message: "Request body must be valid JSON." },
        };
        return NextResponse.json(body, { status: 400 });
      }

      const parsed = updateProfileSchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors = parsed.error.issues.map((e) => ({
          field: e.path.join(".") || "display_name",
          message: e.message,
        }));
        throw new ValidationError("Validation failed.", fieldErrors);
      }

      const updated = await updateProfile(user.id, { display_name: parsed.data.display_name });
      const responseBody: ApiResponse<ProfileWithTimestamps> = { data: updated, error: null };
      return NextResponse.json(responseBody, { status: 200 });
    },
    { userId: user.id, route: "PATCH /api/profile" },
  );
}
