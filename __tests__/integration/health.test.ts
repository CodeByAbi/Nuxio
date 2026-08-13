jest.mock("@/lib/server/shared/logger", () => ({
  childLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));

jest.mock("@/lib/server/shared/supabase-admin-client", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import { GET } from "@/app/api/health/route";
import { createSupabaseAdminClient } from "@/lib/server/shared/supabase-admin-client";

const mockedCreateSupabaseAdminClient = createSupabaseAdminClient as jest.Mock;

describe("GET /api/health", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with an ok envelope when Supabase is reachable", async () => {
    mockedCreateSupabaseAdminClient.mockReturnValue({
      auth: { admin: { listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }) } },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data.status).toBe("ok");
    expect(typeof body.data.timestamp).toBe("string");
    expect(typeof body.data.version).toBe("string");
  });

  it("returns 503 when Supabase reports an error", async () => {
    mockedCreateSupabaseAdminClient.mockReturnValue({
      auth: {
        admin: { listUsers: jest.fn().mockResolvedValue({ data: null, error: new Error("connection refused") }) },
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("returns 503 when constructing the admin client throws", async () => {
    mockedCreateSupabaseAdminClient.mockImplementation(() => {
      throw new Error("missing env vars");
    });

    const response = await GET();
    expect(response.status).toBe(503);
  });
});
