import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Home Screen badge: unanswered cards. Filled in by sendPush. */
  badge?: number;
}

export interface PushOptions {
  /** The card this push is for; its page then shows which devices took it. */
  runId?: string;
  /** Only this device (Me → Send test). */
  subscriptionId?: string;
}

/** Devices not seen for this long are dropped: a phone that's gone stops costing a send every reminder. */
export const STALE_DEVICE_DAYS = 60;
/** Delivery records older than this are cleared as new ones come in. */
const KEEP_DELIVERIES_DAYS = 30;
const DAY = 86_400_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busy or briefly down (429, 5xx): worth one more try. Gone (404, 410) or refused: not. */
const retryable = (code?: number) => code === undefined || code === 429 || code >= 500;

function retryAfter(e: unknown) {
  const header = (e as { headers?: Record<string, string> }).headers?.["retry-after"];
  const seconds = Number(header);
  // Capped: the tick has other people to get to.
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 5000) : 1000;
}

/**
 * Sends to every registered device of a user (roadmap 1.10): retries a busy push
 * service once, records what each device said, and prunes expired or long-unseen
 * subscriptions. Returns how many devices accepted it.
 */
export async function sendPush(db: SupabaseClient, userId: string, payload: PushPayload, opts: PushOptions = {}) {
  if (!configure()) {
    console.warn("[push] VAPID keys missing, skipping push");
    return 0;
  }
  const stale = new Date(Date.now() - STALE_DEVICE_DAYS * DAY).toISOString();
  await Promise.all([
    db.from("push_subscriptions").delete().eq("user_id", userId).lt("last_seen_at", stale),
    db.from("push_deliveries").delete().eq("user_id", userId).lt("created_at", new Date(Date.now() - KEEP_DELIVERIES_DAYS * DAY).toISOString()),
  ]);
  let subsQuery = db.from("push_subscriptions").select("*").eq("user_id", userId);
  if (opts.subscriptionId) subsQuery = subsQuery.eq("id", opts.subscriptionId);
  const [{ data: subs }, { count }] = await Promise.all([
    subsQuery,
    db.from("runs").select("id", { count: "exact", head: true }).eq("user_id", userId).is("acknowledged_at", null).gte("fired_at", new Date(Date.now() - DAY).toISOString()),
  ]);
  payload = { ...payload, badge: count ?? 0 };
  const results = await Promise.all(
    (subs ?? []).map(async (s) => {
      const send = () =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60, urgency: "high", timeout: 8000 });
      let attempts = 1;
      try {
        try {
          const res = await send();
          return { s, ok: true, status: res?.statusCode ?? null, attempts };
        } catch (e) {
          if (!retryable((e as { statusCode?: number }).statusCode)) throw e;
          await wait(retryAfter(e));
          attempts++;
          const res = await send();
          return { s, ok: true, status: res?.statusCode ?? null, attempts };
        }
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("[push] failed", code, e);
        return { s, ok: false, status: code ?? null, attempts };
      }
    }),
  );
  if (results.length) {
    const { error } = await db.from("push_deliveries").insert(
      results.map((r) => ({
        user_id: userId,
        run_id: opts.runId ?? null,
        // A pruned (gone) device leaves no row to point at.
        subscription_id: r.status === 404 || r.status === 410 ? null : r.s.id,
        device_label: r.s.device_label,
        ok: r.ok,
        status: r.status,
        attempts: r.attempts,
      })),
    );
    if (error) console.error("[push] delivery record failed", error.message);
  }
  return results.filter((r) => r.ok).length;
}
