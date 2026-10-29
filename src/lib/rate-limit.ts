// Rate limits for public endpoints (roadmap 1.4). Fixed-window counters live in
// the rate_limits table and are bumped by hit_rate_limit() in one statement, so
// every serverless instance sees the same count. Windows are aligned to the
// epoch, so the daily one turns over at midnight UTC.
import type { SupabaseClient } from "@supabase/supabase-js";

interface Limit {
  limit: number;
  windowSeconds: number;
  /** Refuse while the counter can't be reached: only where a miss costs money. */
  failClosed?: boolean;
}

export const LIMITS = {
  /** Per Shortcut key (hashed): a Shortcut fires a few times a day, not a minute. */
  hookKey: { limit: 60, windowSeconds: 60 },
  /** Per IP across the hooks and the fridge camera, keys or not. */
  hookIp: { limit: 120, windowSeconds: 60 },
  /** Per person: each scan is a paid AI call. */
  fridgeScan: { limit: 20, windowSeconds: 86_400, failClosed: true },
  /** Per IP: account creation is rare and the invite code is guessable by brute force. */
  signUp: { limit: 5, windowSeconds: 3600 },
} satisfies Record<string, Limit>;

export type LimitRule = keyof typeof LIMITS;

/** Vercel's edge overwrites x-forwarded-for with the real client, so its first hop can be trusted there. */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

/** Counts one hit; false once the bucket is over its limit. Fails open unless the rule says otherwise, so a counter outage doesn't stop wake-ups. */
export async function allow(db: SupabaseClient, rule: LimitRule, key: string) {
  const { limit, windowSeconds, failClosed }: Limit = LIMITS[rule];
  const { data, error } = await db.rpc("hit_rate_limit", { p_bucket: `${rule}:${key}`, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[rate-limit]", rule, error.message);
    return !failClosed;
  }
  return data !== false;
}

/** Seconds until the current window ends. */
export function secondsLeft(rule: LimitRule, now = new Date()) {
  const { windowSeconds } = LIMITS[rule];
  return windowSeconds - (Math.floor(now.getTime() / 1000) % windowSeconds);
}

export function tooMany(rule: LimitRule, now = new Date()) {
  // Shortcuts show "message"; Hebrew and English both, since there's no session to pick one.
  const message = "⏳ Too many requests. Try again later. · יותר מדי בקשות. נסו שוב מאוחר יותר.";
  return Response.json({ error: "too many requests", message }, { status: 429, headers: { "Retry-After": String(secondsLeft(rule, now)) } });
}
