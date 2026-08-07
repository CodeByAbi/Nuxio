import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session cookie on every matched request so it
 * doesn't expire mid-session. Builds its own `createServerClient` (rather
 * than reusing `supabase-server-client.ts`) because middleware reads/writes
 * cookies via `NextRequest`/`NextResponse`, not the `next/headers`
 * `cookies()` API that Route Handlers and Server Components use.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Calling getUser() (not getSession()) forces a round-trip that validates
  // the token and triggers a refresh when needed, writing the new cookie
  // via setAll above before the response is sent.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
