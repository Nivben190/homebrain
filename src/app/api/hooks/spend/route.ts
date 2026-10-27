import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";
import { categorize, matchesCommit, parseSpendSms, merchantKey, pickSpendSpace, readTx, recurringCharges, spendKey, TX_PROP, type Tx } from "@/lib/spend";
import { readSub, subPatch, type SubProps } from "@/lib/subs/types";
import type { Currency } from "@/lib/subs/parse";
import { commitProps, readCommit, spent, status } from "@/lib/commit";
import { fill, getDict, isLocale } from "@/i18n";

export const dynamic = "force-dynamic";

const money = (n: number, c: string) => (c === "$" || c === "€" ? `${c}${n}` : `₪${n}`);

/**
 * A purchase text from Max / the bank, forwarded by an iPhone "Message" automation.
 *   POST /api/hooks/spend?token=<hook_token>   body: { "text": "<the SMS>" }
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-brain-token");
  let text = url.searchParams.get("text");
  try {
    const body = await request.json();
    if (body && typeof body.text === "string") text ??= body.text;
  } catch {
    // Query params are enough.
  }
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
  text = text?.trim().slice(0, 1000) ?? "";

  const db = createSupabaseAdmin();
  const { data: me } = await db.from("profiles").select("user_id,household_id,locale,timezone").eq("hook_token", token).maybeSingle();
  if (!me?.household_id) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const parsed = parseSpendSms(text);
  if (!parsed) return NextResponse.json({ ok: true, ignored: true });

  const { data: spaces } = await db
    .from("sections")
    .select("id,owner_id,settings,icon")
    .eq("household_id", me.household_id)
    .eq("view", "spend")
    .or(`owner_id.is.null,owner_id.eq.${me.user_id}`);
  const space = pickSpendSpace(spaces ?? [], parsed.card);
  if (!space) return NextResponse.json({ error: "no Spending space" }, { status: 404 });

  const key = spendKey(text);
  const { data: dupe } = await db.from("items").select("id").eq("section_id", space.id).eq(`props->${TX_PROP}->>key`, key).maybeSingle();
  if (dupe) return NextResponse.json({ ok: true, duplicate: true });

  const tx: Tx = { ...parsed, at: new Date().toISOString(), category: categorize(parsed.merchant), key };
  const title = parsed.merchant || money(parsed.amount, parsed.currency);
  const { error } = await db.from("items").insert({ section_id: space.id, created_by: me.user_id, position: Date.now() / 1000, title, props: { [TX_PROP]: tx } });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!parsed.refund && parsed.merchant) await noteSubscription(db, me, space, parsed.merchant);

  // Count it toward running "stay under" commitments that name this merchant.
  const t = getDict(isLocale(me.locale) ? me.locale : "he");
  const notes: string[] = [];
  if (!parsed.refund && parsed.merchant) {
    const { data: commitSpaces } = await db.from("sections").select("id").eq("household_id", me.household_id).eq("view", "commit");
    const { data: commits } = await db
      .from("items")
      .select("id,title,props")
      .in("section_id", (commitSpaces ?? []).map((s) => s.id))
      .eq("done", false);
    for (const c of commits ?? []) {
      const spec = readCommit(c.props);
      if (!spec || spec.limit === undefined || status(spec) !== "active" || !matchesCommit(c.title, parsed.merchant)) continue;
      const next = { ...spec, log: [...(spec.log ?? []), { at: tx.at, amount: parsed.amount, note: parsed.merchant }] };
      await db.from("items").update({ props: commitProps(c.props, next) }).eq("id", c.id);
      const used = Math.round(spent(next) * 100) / 100;
      notes.push(
        used > spec.limit
          ? `${fill(t.commit.overTitle, { item: c.title })} · ${fill(t.commit.overBody, { spent: money(used, "₪"), limit: money(spec.limit, "₪") })}`
          : `🤝 ${c.title}: ${fill(t.commit.of, { spent: money(used, "₪"), limit: money(spec.limit, "₪") })}`,
      );
    }
  }

  await sendPush(db, me.user_id, {
    title: `${space.icon} ${parsed.refund ? "↩︎ " : ""}${money(parsed.amount, parsed.currency)} · ${title}`,
    body: notes.join("\n") || t.spend.categories[tx.category],
    url: `/sections/${space.id}`,
  });
  return NextResponse.json({ ok: true, amount: parsed.amount, merchant: parsed.merchant });
}

const CURRENCY: Record<string, Currency> = { "₪": "ILS", $: "USD", "€": "EUR" };
const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * A shop that now charges about the same every month becomes (or updates) a
 * subscription, in the Subscriptions space that matches this Spending space's
 * privacy. One already found in Gmail under the same name is left alone.
 */
async function noteSubscription(
  db: ReturnType<typeof createSupabaseAdmin>,
  me: { user_id: string; household_id: string; timezone: string },
  space: { id: string; owner_id: string | null },
  merchant: string,
) {
  const { data: rows } = await db.from("items").select("props").eq("section_id", space.id).order("created_at", { ascending: false }).limit(2000);
  const txs = (rows ?? []).map((r) => readTx(r.props)).filter((t): t is Tx => !!t);
  const found = recurringCharges(txs).find((r) => r.key === `card:${merchantKey(merchant)}`);
  if (!found) return;

  const { data: subSpaces } = await db.from("sections").select("id,owner_id").eq("household_id", me.household_id).eq("view", "subscriptions").or(`owner_id.is.null,owner_id.eq.${me.user_id}`).order("position");
  const target = subSpaces?.find((s) => s.owner_id === space.owner_id) ?? subSpaces?.[0];
  if (!target) return;
  const { data: items } = await db.from("items").select("id,title,props").eq("section_id", target.id);
  const same = (items ?? []).find((i) => readSub(i.props)?.key === found.key);
  const named = (items ?? []).find((i) => i !== same && (plain(i.title).includes(plain(found.merchant)) || plain(found.merchant).includes(plain(i.title))));
  if (named && !same) return;

  const old = same ? readSub(same.props)! : null;
  if (old?.status === "hidden" || old?.edited) return;
  const sub: SubProps = {
    ...(old ?? { key: found.key, source: "card", status: "active", icon: "💳", remind: false, cancel: null }),
    amount: found.amount,
    currency: CURRENCY[found.currency] ?? "ILS",
    cycle: "monthly",
    last: found.last,
    next: found.next,
  } as SubProps;
  const patch = subPatch(same?.props ?? {}, sub, me.timezone, new Set());
  if (same) await db.from("items").update(patch).eq("id", same.id);
  else await db.from("items").insert({ section_id: target.id, title: found.merchant, created_by: me.user_id, position: Date.now() / 1000, ...patch });
}
