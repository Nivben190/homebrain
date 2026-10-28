import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // The offline screen (src/app/~offline) is precached so it works with no signal.
  additionalPrecacheEntries: [{ url: "/~offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()) }],
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
