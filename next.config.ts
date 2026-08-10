import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const supabaseUrl = process.env.SUPABASE_URL;
let supabaseHost: string | undefined;
try {
  supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : undefined;
} catch {
  supabaseHost = undefined;
}

const isDev = process.env.NODE_ENV !== "production";

const cspConnectSrc = [
  "'self'",
  "https://generativelanguage.googleapis.com",
  ...(supabaseHost
    ? [`https://${supabaseHost}`, `wss://${supabaseHost}`]
    : []),
].join(" ");

// Supabase Storage (avatar/attachment) URLs are served from the same host as the API.
const cspImgSrc = [
  "'self'",
  "data:",
  "blob:",
  ...(supabaseHost ? [`https://${supabaseHost}`] : []),
].join(" ");

// 'unsafe-eval' is required by Next.js dev (HMR/Fast Refresh) only — dropped in production.
// 'unsafe-inline' for script/style remains until a nonce-based CSP is wired through middleware
// (tracked as follow-up — see docs/03. Architecture Decisions.md audit notes).
const cspScriptSrc = [
  "'self'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  "'unsafe-inline'",
].join(" ");

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${cspScriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src ${cspImgSrc}`,
      "font-src 'self'",
      `connect-src ${cspConnectSrc}`,
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "nuxio-az",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
