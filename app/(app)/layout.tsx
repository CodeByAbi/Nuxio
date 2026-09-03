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
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/30 flex flex-col">
        {/* Logo/Brand */}
        <div className="p-6 border-b">
          <Link href="/home" className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="font-bold text-xl">Nuxio</span>
          </Link>
        </div>

        {/* Workspace Switcher Placeholder */}
        <div className="p-4 border-b">
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {/* WorkspaceSwitcher component will go here */}
            Workspace: Personal
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {/* Main Features */}
          <div className="space-y-1">
            <Link
              href="/home"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
            >
              <span>📅</span>
              <span className="font-medium">Calendar</span>
            </Link>
            <Link
              href="/wallet"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
            >
              <span>👛</span>
              <span>Wallet</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">Soon</span>
            </Link>
            <Link
              href="/transaction"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
            >
              <span>💸</span>
              <span>Transaction</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">Soon</span>
            </Link>
            <Link
              href="/budget"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
            >
              <span>📊</span>
              <span>Budget</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">Soon</span>
            </Link>
            <Link
              href="/goal"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
            >
              <span>🎯</span>
              <span>Goal</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">Soon</span>
            </Link>
          </div>

          {/* Divider */}
          <div className="my-4 border-t" />

          {/* Workspace Section */}
          <div className="space-y-1">
            <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
              Workspace
            </p>
            <Link
              href="/workspace/settings?workspace_id="
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
            >
              <span>⚙️</span>
              <span>Settings</span>
            </Link>
            <Link
              href="/workspace/members?workspace_id="
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
            >
              <span>👥</span>
              <span>Members</span>
              <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">Business</span>
            </Link>
            <Link
              href="/category"
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
            >
              <span>🏷️</span>
              <span>Categories</span>
            </Link>
          </div>
        </nav>

        {/* User Menu (Bottom) */}
        <div className="p-4 border-t space-y-2">
          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
          >
            <span>👤</span>
            <span className="flex-1 truncate text-sm">{user.email}</span>
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Log out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* AI Copilot Floating Button (Stub) */}
      <button
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
        title="AI Copilot (Coming Soon)"
        disabled
      >
        <span className="text-2xl">🤖</span>
      </button>
    </div>
  );
}
