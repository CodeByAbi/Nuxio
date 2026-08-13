"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signInWithEmail, signOut, signUpWithEmail } from "@/lib/server/auth/auth.service";
import { RateLimitError } from "@/lib/server/shared/errors";
import { loginSchema, registerSchema } from "@/lib/shared/schemas/auth";

export interface AuthActionState {
  error: string | null;
}

const GENERIC_VALIDATION_MESSAGE = "Please check your details and try again.";
const GENERIC_RATE_LIMIT_MESSAGE = "Too many attempts. Please try again later.";
const GENERIC_REGISTER_FAILURE_MESSAGE =
  "Could not create your account. Please check your details and try again.";
const GENERIC_LOGIN_FAILURE_MESSAGE = "Invalid email or password.";

// "/" is the Phase 0 Coming Soon marketing page (app/page.tsx) — the
// authenticated area lives at /home until Coming Soon is retired.
const AUTHENTICATED_HOME = "/home";

async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: GENERIC_VALIDATION_MESSAGE };
  }

  const ip = await getClientIp();

  try {
    const result = await signUpWithEmail(parsed.data.email, parsed.data.password, ip);
    if (result.error) {
      return { error: GENERIC_REGISTER_FAILURE_MESSAGE };
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: GENERIC_RATE_LIMIT_MESSAGE };
    }
    throw err;
  }

  redirect(AUTHENTICATED_HOME);
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: GENERIC_VALIDATION_MESSAGE };
  }

  const ip = await getClientIp();

  try {
    const result = await signInWithEmail(parsed.data.email, parsed.data.password, ip);
    if (result.error) {
      return { error: GENERIC_LOGIN_FAILURE_MESSAGE };
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: GENERIC_RATE_LIMIT_MESSAGE };
    }
    throw err;
  }

  redirect(AUTHENTICATED_HOME);
}

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
