// One key per Shortcut (roadmap 1.3). Keys are random, shown once, and stored
// only as SHA-256 hashes in hook_keys, so rotating one breaks only that Shortcut.
// The in-app 🔄 button can't know a raw key, so it hands the Shortcut a signed
// launch token instead (user + purpose + expiry, HMAC).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HOOK_PURPOSES = ["event", "capture", "spend", "checkin", "notes", "fridge"] as const;
export type HookPurpose = (typeof HOOK_PURPOSES)[number];

/** The old single profiles.hook_token keeps working until this moment, while Shortcuts move to keys. */
export const LEGACY_TOKEN_UNTIL = new Date("2026-11-12T00:00:00Z");

const LAUNCH_TTL_MS = 24 * 3600_000;

export function newKey() {
  return `hb_${randomBytes(32).toString("base64url")}`;
}

export function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Header first (stays out of logs and history); the query string still works for older Shortcuts. */
export function presentedToken(request: Request) {
  return request.headers.get("x-brain-token") ?? new URL(request.url).searchParams.get("token");
}

export function legacyAccepted(now = new Date()) {
  return now < LEGACY_TOKEN_UNTIL;
}

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signLaunch(userId: string, purpose: HookPurpose, secret: string, now = new Date()) {
  const body = `${userId}.${purpose}.${Math.floor((now.getTime() + LAUNCH_TTL_MS) / 1000)}`;
  return `l1.${body}.${sign(body, secret)}`;
}

/** The user a launch token was signed for, or null if it's forged, expired or for another purpose. */
export function verifyLaunch(token: string, purpose: HookPurpose, secret: string, now = new Date()) {
  const [version, userId, forPurpose, exp, mac] = token.split(".");
  if (version !== "l1" || !userId || !exp || !mac || forPurpose !== purpose) return null;
  const expected = Buffer.from(sign(`${userId}.${forPurpose}.${exp}`, secret));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(exp) * 1000 > now.getTime() ? userId : null;
}
