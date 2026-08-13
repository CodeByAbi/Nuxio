import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/server/auth/require-auth";
import { AuthenticationError } from "@/lib/server/shared/errors";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) {
      redirect("/login");
    }
    throw err;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border flex items-center justify-end border-b px-4 py-3">
        <nav className="flex items-center gap-3">
          <Link href="/profile" className="text-muted-foreground text-sm hover:text-foreground">
            Profile
          </Link>
          <form action={logoutAction} className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">{user.email}</span>
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </form>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
