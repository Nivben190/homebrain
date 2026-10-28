import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // The offline screen (src/app/~offline) is precached so it works with no signal.
  additionalPrecacheEntries: [{ url: "/~offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()) }],
});

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Report-Only for now: browsers log what it would block without blocking it.
// Once the console stays quiet on both phones, rename the header to enforce it.
// Inline scripts are allowed because Next injects its bootstrap inline (a nonce
// from middleware would let this tighten later).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  `connect-src 'self' ${supabase} ${supabase.replace(/^https:/, "wss:")}`,
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app's own pages may use the camera and location ("Use my location"); nothing embedded may.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSerwist(nextConfig);
