import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo, matches app/page.tsx precedent */}
      <img src="/logo.svg" alt="Nuxio" className="h-7 w-auto" />
      {children}
    </div>
  );
}
