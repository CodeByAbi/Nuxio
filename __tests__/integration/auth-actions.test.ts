jest.mock("@/lib/server/shared/supabase-server-client", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/headers", () => ({ headers: jest.fn() }));

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loginAction, logoutAction, registerAction } from "@/app/(auth)/actions";
import type { AuthActionState } from "@/app/(auth)/actions";
import { requireAuth } from "@/lib/server/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";

// actions.ts is a "use server" file, which may only export async functions —
// the initial useActionState() value can't live there, so it's local to
// each caller (the real form components inline it the same way).
const INITIAL_AUTH_ACTION_STATE: AuthActionState = { error: null };

const mockedCreateClient = createSupabaseServerClient as jest.Mock;
const mockedHeaders = headers as jest.Mock;
// redirect()'s real signature returns `never`, which doesn't overlap enough
// with jest.Mock for a direct assertion — go through `unknown` deliberately.
const mockedRedirect = redirect as unknown as jest.Mock;

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

function withIp(ip: string) {
  mockedHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": ip }));
}

function buildFormData(email: string, password: string) {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  return formData;
}

describe("auth Server Actions", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("register then login through the real Server Actions leaves a session requireAuth() accepts", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    withIp("203.0.113.10");

    await registerAction(INITIAL_AUTH_ACTION_STATE, buildFormData("a@example.com", "password1"));
    expect(mockedRedirect).toHaveBeenCalledWith("/home");

    mockedRedirect.mockClear();
    await loginAction(INITIAL_AUTH_ACTION_STATE, buildFormData("a@example.com", "password1"));
    expect(mockedRedirect).toHaveBeenCalledWith("/home");

    const user = await requireAuth();
    expect(user).toEqual({ id: "user-1", email: "a@example.com" });
  });

  it("rejects invalid form input before touching Supabase or the rate limiter", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    withIp("203.0.113.11");

    const state = await registerAction(
      INITIAL_AUTH_ACTION_STATE,
      buildFormData("not-an-email", "password1")
    );

    expect(state.error).toBeTruthy();
    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("surfaces a generic message when credentials are rejected, never the raw Supabase error", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Invalid login credentials" },
        }),
      },
    });
    withIp("203.0.113.12");

    const state = await loginAction(
      INITIAL_AUTH_ACTION_STATE,
      buildFormData("a@example.com", "wrong-password")
    );

    expect(state.error).toBe("Invalid email or password.");
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("keeps rate limiting enforced when register is driven through the Server Action, not just the service call", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    withIp("203.0.113.60");

    for (let i = 0; i < 5; i++) {
      // A successful action calls redirect() and (in real Next.js) never
      // returns — the mock doesn't throw, so there's no state to assert on
      // here; the redirect call count below is the success signal.
      await registerAction(
        INITIAL_AUTH_ACTION_STATE,
        buildFormData(`user${i}@example.com`, "password1")
      );
    }
    expect(mockedRedirect).toHaveBeenCalledTimes(5);

    const blockedState = await registerAction(
      INITIAL_AUTH_ACTION_STATE,
      buildFormData("user6@example.com", "password1")
    );
    expect(blockedState.error).toBe("Too many attempts. Please try again later.");
    expect(mockedRedirect).toHaveBeenCalledTimes(5);
  });

  it("keys the rate limit per IP, not globally, when driven through the Server Action", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());

    for (let i = 0; i < 5; i++) {
      withIp("203.0.113.70");
      await registerAction(
        INITIAL_AUTH_ACTION_STATE,
        buildFormData(`userA${i}@example.com`, "password1")
      );
    }
    expect(mockedRedirect).toHaveBeenCalledTimes(5);

    withIp("203.0.113.71");
    await registerAction(
      INITIAL_AUTH_ACTION_STATE,
      buildFormData("userB@example.com", "password1")
    );
    expect(mockedRedirect).toHaveBeenCalledTimes(6);
  });

  it("rejects invalid login form input without touching Supabase or the rate limiter", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    withIp("203.0.113.20");

    const state = await loginAction(INITIAL_AUTH_ACTION_STATE, buildFormData("not-an-email", "x"));

    expect(state.error).toBeTruthy();
    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("surfaces a generic message when Supabase rejects registration, never the raw error", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        signUp: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "User already registered" },
        }),
      },
    });
    withIp("203.0.113.21");

    const state = await registerAction(
      INITIAL_AUTH_ACTION_STATE,
      buildFormData("a@example.com", "password1")
    );

    expect(state.error).toBe(
      "Could not create your account. Please check your details and try again."
    );
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("keeps login's rate limit enforced when driven through the Server Action", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    withIp("203.0.113.80");

    for (let i = 0; i < 10; i++) {
      await loginAction(INITIAL_AUTH_ACTION_STATE, buildFormData("a@example.com", "password1"));
    }
    expect(mockedRedirect).toHaveBeenCalledTimes(10);

    const blockedState = await loginAction(
      INITIAL_AUTH_ACTION_STATE,
      buildFormData("a@example.com", "password1")
    );
    expect(blockedState.error).toBe("Too many attempts. Please try again later.");
    expect(mockedRedirect).toHaveBeenCalledTimes(10);
  });

  it("logout signs out and redirects to /login, and requireAuth() rejects again afterward", async () => {
    mockedCreateClient.mockResolvedValue(createFakeSupabaseAuth());
    withIp("203.0.113.90");

    await loginAction(INITIAL_AUTH_ACTION_STATE, buildFormData("a@example.com", "password1"));
    expect(await requireAuth()).toEqual({ id: "user-1", email: "a@example.com" });

    await logoutAction();
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
    await expect(requireAuth()).rejects.toThrow();
  });
});
