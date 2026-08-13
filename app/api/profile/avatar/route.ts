import { NextResponse } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { uploadAvatar } from "@/lib/server/profile/avatar.service";
import { childLogger } from "@/lib/server/shared/logger";
import { ValidationError } from "@/lib/server/shared/errors";
import type { ApiResponse } from "@/types/api";
import { ErrorCode } from "@/types/errors";

// Always parse the form fresh — never cache multipart uploads.
export const dynamic = "force-dynamic";

const log = childLogger("api:profile:avatar");

/**
 * POST /api/profile/avatar
 *
 * Accepts multipart/form-data with a `file` field containing the avatar image.
 *
 * 200 { data: { avatar_url: string } }
 * 400 Invalid MIME type or file size > 2 MB
 * 401 Not authenticated
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  return withErrorHandling(
    async () => {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        const body: ApiResponse<never> = {
          data: null,
          error: { code: ErrorCode.VALIDATION_ERROR, message: "Expected multipart/form-data request." },
        };
        return NextResponse.json(body, { status: 400 });
      }

      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new ValidationError("Missing required field: 'file' must be a file upload.", [
          { field: "file", message: "A file is required." },
        ]);
      }

      log.info({ userId: user.id, mimeType: file.type, sizeBytes: file.size }, "api:profile:avatar POST received");

      const avatarUrl = await uploadAvatar(user.id, file);

      const body: ApiResponse<{ avatar_url: string }> = { data: { avatar_url: avatarUrl }, error: null };
      return NextResponse.json(body, { status: 200 });
    },
    { userId: user.id, route: "POST /api/profile/avatar" },
  );
}
