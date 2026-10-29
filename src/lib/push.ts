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

/** Sends to every registered device of a user; prunes expired subscriptions. */
export async function sendPush(db: SupabaseClient, userId: string, payload: PushPayload) {
  if (!configure()) {
    console.warn("[push] VAPID keys missing, skipping push");
    return 0;
  }
  const [{ data: subs }, { count }] = await Promise.all([
    db.from("push_subscriptions").select("*").eq("user_id", userId),
    db.from("runs").select("id", { count: "exact", head: true }).eq("user_id", userId).is("acknowledged_at", null).gte("fired_at", new Date(Date.now() - 86400000).toISOString()),
  ]);
  payload = { ...payload, badge: count ?? 0 };
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: "high" },
        );
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("[push] failed", code, e);
      }
    }),
  );
  return sent;
}
