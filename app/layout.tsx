import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/client/providers";

import "./globals.css";

// Inter drives --font-sans (see app/globals.css @theme inline). Chosen deliberately for a
// financial-planning product — legibility/trust over typographic personality; not a default
// left over from create-next-app. See docs/12. UI Design System.md §12.8.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // TODO: ganti ke domain produksi final begitu domain Nuxio dikonfirmasi.
  metadataBase: new URL("https://nuxio.app"),
  title: "Nuxio",
  description: "Nuxio — financial planning workspace untuk personal dan small business.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
