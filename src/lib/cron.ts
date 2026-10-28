import "server-only";

/** True when a request carries the pg_cron secret (Vault cron_secret = CRON_SECRET). */
export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}
