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

export default nextConfig;
