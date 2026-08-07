import { NextResponse } from "next/server";

import { childLogger } from "@/lib/server/shared/logger";
import { createSupabaseAdminClient } from "@/lib/server/shared/supabase-admin-client";
import type { ApiResponse } from "@/types/api";
import { ErrorCode } from "@/types/errors";
import packageJson from "@/package.json";

// Always re-run the connectivity check — never serve a cached health status.
export const dynamic = "force-dynamic";

const log = childLogger("api:health");

interface HealthData {
  status: "ok";
  timestamp: string;
  version: string;
}

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // Uses the admin client's Auth API (not a table read) so this check
    // works even before the app schema has any tables applied.
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      throw error;
    }

    const body: ApiResponse<HealthData> = {
      data: { status: "ok", timestamp, version: packageJson.version },
      error: null,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    log.error({ err }, "Health check failed: Supabase connectivity error");
    const body: ApiResponse<never> = {
      data: null,
      error: { code: ErrorCode.INTERNAL_ERROR, message: "Service unhealthy: database connection failed." },
    };
    return NextResponse.json(body, { status: 503 });
  }
}
