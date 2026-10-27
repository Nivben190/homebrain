import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDict, fill } from "@/i18n";
import { sendPush } from "@/lib/push";
import { todayKey } from "@/lib/engine/habits";
import type { Item, Profile } from "@/lib/db-types";
import { SERVICES } from "./catalog";
import { getMessage, GoogleAuthError, listMessageIds, openToken, refreshAccess } from "./gmail";
import { chargesFrom, rollForward, summarize, type DetectedSub, type MailMessage } from "./parse";
import { readSub, subPatch, type SubProps } from "./types";

type Db = SupabaseClient;

/** A Subscriptions space's Gmail account (public.gmail_connections). */
export interface GmailConnection {
  section_id: string;
  /** Who connected it: their timezone/language/push are used. */
  user_id: string;
  refresh_token: string;
  email: string | null;
  status: "ok" | "expired";
  last_scan_at: string | null;
}

export type ScanResult = { ok: true; found: number; added: number } | { ok: false; error: "not_connected" | "expired" | "failed" };

const SKIP_DOMAINS = new Set(["google.com"]);
const KNOWN_FROM = ["apple.com", "paypal.com", ...SERVICES.flatMap((s) => s.domains).filter((d) => !SKIP_DOMAINS.has(d))];
const QUERIES: [string, number][] = [
  [`newer_than:400d from:(${[...new Set(KNOWN_FROM)].join(" OR ")})`, 300],
  [`newer_than:400d -category:promotions subject:(receipt OR invoice OR subscription OR renewal OR renews OR membership OR payment OR "order receipt" OR קבלה OR חשבונית OR מנוי OR חידוש OR תשלום OR חיוב)`, 400],
];

async function pool<T, R>(xs: T[], size: number, fn: (x: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += size) out.push(...(await Promise.all(xs.slice(i, i + size).map(fn))));
  return out;
}

/** Reads receipts from a space's Gmail account and updates that space. */
export async function scanGmail(db: Db, sectionId: string, opts: { notify?: boolean; now?: Date } = {}): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const { data: row } = await db.from("gmail_connections").select("*").eq("section_id", sectionId).maybeSingle<GmailConnection>();
  if (!row) return { ok: false, error: "not_connected" };
  const { data: profile } = await db.from("profiles").select("*").eq("user_id", row.user_id).single<Profile>();
  if (!profile?.household_id) return { ok: false, error: "failed" };
  const mark = (patch: Record<string, unknown>) => db.from("gmail_connections").update({ ...patch, updated_at: now.toISOString() }).eq("section_id", sectionId);

  try {
    const access = await refreshAccess(openToken(row.refresh_token));
    // One search at a time and a few reads at once: Gmail limits how much one mailbox may ask per minute.
    const hits: string[] = [];
    for (const [q, max] of QUERIES) hits.push(...(await listMessageIds(access, q, max)));
    const ids = [...new Set(hits)].slice(0, 600);
    const messages = (await pool(ids, 4, (id) => getMessage(access, id).catch(() => null))).filter(Boolean) as MailMessage[];
    const today = todayKey(profile.timezone, now);
    const found = summarize(messages.flatMap(chargesFrom), today);
    const changes = await mergeSubs(db, profile, sectionId, found, today, now);

    await mark({ status: "ok", last_scan_at: now.toISOString(), scan_error: null });
    if (opts.notify) await notifyChanges(db, profile, sectionId, changes);
    return { ok: true, found: found.length, added: changes.added.length };
  } catch (e) {
    const expired = e instanceof GoogleAuthError;
    await mark({ status: expired ? "expired" : row.status, scan_error: String(e).slice(0, 300), last_scan_at: now.toISOString() });
    console.error("[gmail] scan failed", e);
    return { ok: false, error: expired ? "expired" : "failed" };
  }
}

async function mergeSubs(db: Db, profile: Profile, sectionId: string, found: DetectedSub[], today: string, now: Date) {
  const { data: items } = await db.from("items").select("*, checkins(day,status)").eq("section_id", sectionId).returns<(Item & { checkins: { day: string; status: string }[] })[]>();
  const byKey = new Map<string, Item & { checkins: { day: string; status: string }[] }>();
  for (const i of items ?? []) {
    const s = readSub(i.props);
    if (s?.key) byKey.set(s.key, i);
  }
  let position = Math.max(0, ...(items ?? []).map((i) => i.position)) + 1;
  const added: string[] = [];
  const chargedAgain: { name: string; amount: number | null; currency: string | null }[] = [];

  for (const d of found) {
    const existing = byKey.get(d.key);
    if (!existing) {
      const sub: SubProps = { key: d.key, source: "gmail", status: "active", amount: d.amount, currency: d.currency ?? "ILS", cycle: d.cycle, next: d.next, last: d.last, cancel: d.cancel, icon: d.icon, remind: d.cycle === "yearly", stale: d.stale, charges: d.charges };
      await db.from("items").insert({ section_id: sectionId, title: d.name, created_by: profile.user_id, position: position++, ...subPatch({}, sub, profile.timezone, new Set(), now) });
      added.push(d.name);
      continue;
    }
    const old = readSub(existing.props)!;
    if (old.status === "hidden") continue;
    const sub: SubProps = { ...old, last: d.last, stale: d.stale, charges: d.charges, cancel: old.cancel ?? d.cancel };
    if (old.edited) sub.next = rollForward(d.last, old.cycle, today);
    else Object.assign(sub, { amount: d.amount, currency: d.currency ?? old.currency, cycle: d.cycle, next: d.next });
    if (old.status === "cancelled" && old.cancelledOn && d.last > old.cancelledOn && !old.chargedAfterCancel) {
      sub.status = "active";
      sub.chargedAfterCancel = true;
      chargedAgain.push({ name: existing.title, amount: d.amount, currency: d.currency });
    }
    if (JSON.stringify(sub) === JSON.stringify(old)) continue;
    const handled = new Set(existing.checkins.filter((c) => c.status === "done").map((c) => c.day));
    await db.from("items").update({ ...subPatch(existing.props, sub, profile.timezone, handled, now), updated_at: now.toISOString() }).eq("id", existing.id);
  }
  // Found before but not any more (the rules got better, or it was a false match):
  // drop it, unless the user has touched it.
  const keys = new Set(found.map((d) => d.key));
  const gone = [...byKey.values()].filter((i) => {
    const s = readSub(i.props)!;
    return s.source === "gmail" && s.status === "active" && !s.edited && !keys.has(s.key!);
  });
  if (gone.length) await db.from("items").delete().in("id", gone.map((i) => i.id));
  return { added, chargedAgain };
}

async function notifyChanges(db: Db, profile: Profile, sectionId: string, c: { added: string[]; chargedAgain: { name: string; amount: number | null; currency: string | null }[] }) {
  const t = getDict(profile.locale);
  const url = `/sections/${sectionId}`;
  for (const x of c.chargedAgain) {
    const amount = x.amount !== null ? new Intl.NumberFormat(profile.locale, { style: "currency", currency: x.currency ?? "ILS" }).format(x.amount) : "";
    await sendPush(db, profile.user_id, { title: fill(t.subs.chargedAgainTitle, { name: x.name }), body: fill(t.subs.chargedAgainBody, { amount }), url });
  }
  if (c.added.length) await sendPush(db, profile.user_id, { title: fill(t.subs.newFoundTitle, { n: String(c.added.length) }), body: c.added.slice(0, 5).join(" · "), url });
}

/** Once a day per connected account, from the engine tick (one account per tick). */
export async function scanDueGmail(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 20 * 3600000).toISOString();
  const stale = `last_scan_at.is.null,last_scan_at.lt.${cutoff}`;
  const { data: due } = await db.from("gmail_connections").select("section_id").eq("status", "ok").or(stale).limit(1);
  const sectionId = due?.[0]?.section_id;
  if (!sectionId) return null;
  // Claim it first so overlapping ticks don't scan the same inbox twice.
  const { data: claimed } = await db.from("gmail_connections").update({ last_scan_at: now.toISOString() }).eq("section_id", sectionId).or(stale).select("section_id");
  if (!claimed?.length) return null;
  return scanGmail(db, sectionId, { notify: true, now });
}

