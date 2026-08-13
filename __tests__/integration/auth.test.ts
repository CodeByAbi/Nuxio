jest.mock("@/lib/server/shared/supabase-server-client", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { NextResponse } from "next/server";

import { signInWithEmail, signOut, signUpWithEmail } from "@/lib/server/auth/auth.service";
import { requireAuth } from "@/lib/server/auth/require-auth";
import { AppError, AuthenticationError, RateLimitError } from "@/lib/server/shared/errors";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import type { ApiResponse } from "@/types/api";
import type { AuthUser } from "@/types/auth";

const mockedCreateClient = createSupabaseServerClient as jest.Mock;

/**
 * Route stub built for this test only, mirroring how every real Route
 * Handler will call requireAuth() and translate a thrown AppError into a
 * response — so the 401 assertions below exercise the same shape a real
 * protected route produces.
 */
async function protectedStubRoute() {
  try {
    const user = await requireAuth();
    const body: ApiResponse<AuthUser> = { data: user, error: null };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    if (err instanceof AppError) {
      const body: ApiResponse<never> = {
        data: null,
        error: { code: err.code, message: err.message },
      };
      return NextResponse.json(body, { status: err.statusCode });
    }
    throw err;
  }
}

/** Fakes just enough of the Supabase Auth client to simulate one browser's cookie jar. */
function createFakeSupabaseAuth() {
  let session: { id: string; email: string } | null = null;
  return {
    auth: {
      signUp: jest.fn(async ({ email }: { email: string; password: string }) => {
        session = { id: "user-1", email };
        return { data: { user: session }, error: null };
      }),
      signInWithPassword: jest.fn(async ({ email }: { email: string; password: string }) => {
        session = { id: "user-1", email };
        return { data: { user: session }, error: null };
      }),
      signOut: jest.fn(async () => {
        session = null;
        return { error: null };
      }),
      getUser: jest.fn(async () => {
        if (!session) {
          return { data: { user: null }, error: { message: "no session" } };
        }
        return { data: { user: session }, error: null };
      }),
    },
  };
}

describe("auth service + requireAuth integration", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("register then login leaves a session requireAuth() and the stub route accept", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());

    const registerResult = await signUpWithEmail("a@example.com", "password1", "203.0.113.1");
    expect(registerResult.error).toBeNull();

    const loginResult = await signInWithEmail("a@example.com", "password1", "203.0.113.1");
    expect(loginResult.error).toBeNull();

    const user = await requireAuth();
    expect(user).toEqual({ id: "user-1", email: "a@example.com" });

    const response = await protectedStubRoute();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: "user-1", email: "a@example.com" });
  });

  it("signOut clears the session so requireAuth() rejects again", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());

    await signInWithEmail("b@example.com", "password1", "203.0.113.2");
    expect(await requireAuth()).toEqual({ id: "user-1", email: "b@example.com" });

    await signOut();
    await expect(requireAuth()).rejects.toThrow(AuthenticationError);
  });

  it("requireAuth() returns 401 via the stub route with no session cookie", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());

    const response = await protectedStubRoute();
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("requireAuth() returns 401 via the stub route when the session cookie is invalid", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT" } }),
      },
    });

    const response = await protectedStubRoute();
    expect(response.status).toBe(401);
  });

  it("blocks the 6th register attempt from the same IP within an hour", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    const ip = "203.0.113.50";

    for (let i = 0; i < 5; i++) {
      const result = await signUpWithEmail(`user${i}@example.com`, "password1", ip);
      expect(result.error).toBeNull();
    }

    await expect(signUpWithEmail("user6@example.com", "password1", ip)).rejects.toThrow(
      RateLimitError
    );
  });

  it("blocks the 11th login attempt from the same IP within 15 minutes", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    const ip = "203.0.113.51";

    for (let i = 0; i < 10; i++) {
      const result = await signInWithEmail("a@example.com", "password1", ip);
      expect(result.error).toBeNull();
    }

    await expect(signInWithEmail("a@example.com", "password1", ip)).rejects.toThrow(
      RateLimitError
    );
  });
});
