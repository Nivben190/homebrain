// Plain error copy (roadmap 2.11): raw Supabase and network messages map to a
// few keys with friendly text in both languages (t.errors).

export type ErrorKey = "offline" | "denied" | "invalidLogin" | "unconfirmed" | "tooMany" | "generic";

export function errorKey(error: unknown): ErrorKey {
  const msg = String((error as { message?: unknown })?.message ?? error);
  if (/failed to fetch|network|load failed|fetch failed/i.test(msg)) return "offline";
  if (/row-level security|permission denied|not authorized|jwt/i.test(msg)) return "denied";
  if (/invalid login|invalid credentials/i.test(msg)) return "invalidLogin";
  if (/not confirmed/i.test(msg)) return "unconfirmed";
  if (/rate limit|too many/i.test(msg)) return "tooMany";
  return "generic";
}
