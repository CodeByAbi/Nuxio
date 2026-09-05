"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * QueryProvider wraps the app with TanStack Query's QueryClientProvider.
 * 
 * Configuration:
 * - No automatic retries for financial mutations (user should explicitly retry)
 * - Stale time set to 30 seconds (reasonable for financial data freshness)
 * - Cache time set to 5 minutes
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: 1, // Retry once on failure
            refetchOnWindowFocus: false, // Don't refetch on window focus (noisy for financial data)
          },
          mutations: {
            retry: false, // Never retry mutations automatically
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
