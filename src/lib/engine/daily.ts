import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pet, Profile } from "@/lib/db-types";
import type { PropertyDef } from "@/lib/registry/properties";
import { EXPIRY_PROP, EXPIRY_TEMPLATES, expiryStage, type ExpirySent } from "@/lib/expiry";
import { pushAllowed } from "@/lib/calm";
import { loadMonth } from "@/lib/money-data";
import { sendEmail } from "@/lib/email";
import { weekdayOf } from "./habits";
import { getDict, fill } from "@/i18n";
import { sendPush } from "@/lib/push";
import { buildDay, dayScore, openTitles } from "@/lib/day";
import { DEFAULT_PLACE, weatherEmoji } from "@/lib/weather";
import { getJewishCalendar, hhmmOf, holyStatus } from "@/lib/jewish";
import { addDays, diffDays, todayKey } from "./habits";
import { foodDaysLeft } from "./food";
import { minuteOfDay, parseHHmm, zonedParts, zonedTimeToUtc } from "./time";

type Admin = SupabaseClient;

/** Start of the user's local day, as an ISO timestamp. */
function localMidnight(day: string, timeZone: string) {
  return zonedTimeToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), 0, 0, timeZone).toISOString();
}

async function sentToday(db: Admin, p: Profile, type: string, now: Date) {
  const { count } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", p.user_id)
    .eq("type", type)
    .gte("created_at", localMidnight(todayKey(p.timezone, now), p.timezone));
  return (count ?? 0) > 0;
}

const markSent = (db: Admin, p: Profile, type: string) => db.from("events").insert({ user_id: p.user_id, type });

async function membersOf(db: Admin, householdId: string) {
  const { data } = await db.from("profiles").select("*").eq("household_id", householdId).returns<Profile[]>();
  return data ?? [];
}

/** Minutes between two supermarket pushes: one per visit. */
const STORE_VISIT_MIN = 120;

/**
 * "At the supermarket": one push with the open To-buy items. Nothing when the
 * list is empty or this visit was already announced.
 */
export async function sendStoreList(db: Admin, userId: string, now = new Date()) {
  const { data: me } = await db.from("profiles").select("*").eq("user_id", userId).single<Profile>();
  if (!me?.household_id) return false;
  const { count: recent } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "arrive_store")
    .gte("created_at", new Date(now.getTime() - STORE_VISIT_MIN * 60000).toISOString());
  if (recent) return false;
  const { data: lists } = await db.from("sections").select("id,owner_id").eq("household_id", me.household_id).eq("template", "groceries");
  const ids = (lists ?? []).filter((s) => !s.owner_id || s.owner_id === userId).map((s) => s.id);
  if (!ids.length) return false;
  const { data: items } = await db.from("items").select("title,section_id").in("section_id", ids).eq("done", false).order("position");
  if (!items?.length) return false;
  const t = getDict(me.locale).daily;
  const titles = items.map((i) => i.title);
  await sendPush(db, userId, { title: t.storeTitle, body: titles.slice(0, 12).join(", ") + (titles.length > 12 ? "…" : ""), url: `/sections/${items[0].section_id}` });
  return true;
}

/** True during Shabbat/chag when the user asked for quiet. */
export async function isQuiet(p: Profile, now = new Date()) {
  if (!p.quiet_shabbat) return false;
  const today = todayKey(p.timezone, now);
  const items = await getJewishCalendar(p.lat ?? DEFAULT_PLACE.lat, p.lon ?? DEFAULT_PLACE.lon, p.timezone, addDays(today, -2), addDays(today, 3));
  return holyStatus(items, now).now;
}

// ---------------------------------------------------------------------------
// Morning briefing
// ---------------------------------------------------------------------------

/** One push that sums up the day. Sent on wake (or 09:30 fallback), once a day. */
export async function sendBriefing(db: Admin, userId: string, now = new Date()) {
  const { data: me } = await db.from("profiles").select("*").eq("user_id", userId).single<Profile>();
  if (!me?.household_id || !me.briefing || (await sentToday(db, me, "briefing", now)) || (await isQuiet(me, now))) return false;
  const members = await membersOf(db, me.household_id);
  const day = await buildDay(db, me, members.map((m) => m.user_id), now);
  const t = getDict(me.locale).daily;

  const parts: string[] = [];
  if (day.weather) parts.push(`${weatherEmoji(day.weather.code)} ${day.weather.max}°/${day.weather.min}°${day.weather.rain >= 40 ? ` · 🌧️ ${day.weather.rain}%` : ""}`);
  if (day.advice?.hot && day.advice.windows.length && day.sessions.some((s) => s.habit.outdoor)) {
    const w = day.advice.windows.map((x) => fill(x.startsWith("<") ? t.before : t.after, { t: x.slice(1) })).join(t.or);
    parts.push(fill(t.hotWalk, { w }));
  }
  if (day.holy.erevDay === day.today && day.holy.candles) parts.push(`🕯️ ${fill(t.candles, { t: hhmmOf(day.holy.candles) })}`);
  const chag = day.holy.holidays.find((h) => diffDays(day.today, h.day) >= 0 && diffDays(day.today, h.day) <= 3);
  if (chag) {
    const n = diffDays(day.today, chag.day);
    const name = me.locale === "he" ? (chag.hebrew ?? chag.title) : chag.title;
    parts.push(`🎉 ${fill(n === 0 ? t.chagToday : n === 1 ? t.chagTomorrow : t.chagIn, { name, n })}`);
  }
  const open = openTitles(day);
  parts.push(open.length ? fill(t.todayList, { n: open.length, list: open.slice(0, 3).join(", ") + (open.length > 3 ? "…" : "") }) : t.nothing);

  await markSent(db, me, "briefing");
  await sendPush(db, me.user_id, { title: `☀️ ${t.goodMorning}, ${me.display_name}`, body: parts.join(" · "), url: "/" });
  return true;
}

// ---------------------------------------------------------------------------
// Jobs checked every tick
// ---------------------------------------------------------------------------

const inWindow = (nowMin: number, at: string, minutes = 30) => {
  const start = minuteOfDay(parseHHmm(at.slice(0, 5)));
  return nowMin >= start && nowMin < start + minutes;
};

export async function dailyJobs(db: Admin, now = new Date()) {
  const { data: people } = await db.from("profiles").select("*").not("household_id", "is", null).returns<Profile[]>();
  const sent: string[] = [];
  for (const p of people ?? []) {
    const local = zonedParts(now, p.timezone);
    const nowMin = minuteOfDay(local);

    // Briefing fallback for people who don't use the wake Shortcut.
    if (p.briefing && inWindow(nowMin, "09:30") && (await sendBriefing(db, p.user_id, now))) sent.push(`briefing:${p.user_id}`);

    // Evening wrap-up.
    if ((p.wrapup || p.digest) && inWindow(nowMin, p.wrapup_time) && !(await sentToday(db, p, "wrapup", now)) && !(await isQuiet(p, now))) {
      const members = await membersOf(db, p.household_id!);
      const day = await buildDay(db, p, members.map((m) => m.user_id), now);
      const score = dayScore(day);
      await markSent(db, p, "wrapup");
      if (score.total > 0) {
        const t = getDict(p.locale).daily;
        const body = score.left === 0 ? t.wrapupAllDone : fill(t.wrapupBody, score);
        await sendPush(db, p.user_id, { title: t.wrapupTitle, body, url: "/wrapup" });
        sent.push(`wrapup:${p.user_id}`);
      }
    }

    // Shabbat / chag shopping, morning of erev.
    if (p.shabbat_shop && inWindow(nowMin, "09:00") && !(await sentToday(db, p, "shabbat_shop", now))) {
      const today = todayKey(p.timezone, now);
      const items = await getJewishCalendar(p.lat ?? DEFAULT_PLACE.lat, p.lon ?? DEFAULT_PLACE.lon, p.timezone, addDays(today, -1), addDays(today, 7));
      if (holyStatus(items, now).erevDay === today) {
        const { data: lists } = await db.from("sections").select("id,owner_id").eq("household_id", p.household_id!).eq("template", "groceries");
        const list = (lists ?? []).find((s) => !s.owner_id || s.owner_id === p.user_id);
        const { count } = list ? await db.from("items").select("id", { count: "exact", head: true }).eq("section_id", list.id).eq("done", false) : { count: 0 };
        const t = getDict(p.locale).daily;
        await markSent(db, p, "shabbat_shop");
        await sendPush(db, p.user_id, { title: t.shopTitle, body: count ? fill(t.shopBody, { n: count }) : t.shopBodyEmpty, url: list ? `/sections/${list.id}` : "/" });
        sent.push(`shop:${p.user_id}`);
      }
    }
  }

  sent.push(...(await foodAlerts(db, people ?? [], now)));
  sent.push(...(await expiryAlerts(db, people ?? [], now)));
  sent.push(...(await monthEndSummary(db, people ?? [], now)));
  sent.push(...(await weeklyCheckin(db, people ?? [], now)));
  return sent;
}

/** Sunday 20:00, before the check-in: a push and an email pointing at the weekly page (roadmap 3.8). */
async function weeklyCheckin(db: Admin, people: Profile[], now: Date) {
  const sent: string[] = [];
  for (const p of people) {
    if (!p.household_id || weekdayOf(todayKey(p.timezone, now)) !== 0 || !inWindow(minuteOfDay(zonedParts(now, p.timezone)), "20:00")) continue;
    if (await sentToday(db, p, "weekly", now)) continue;
    await markSent(db, p, "weekly");
    const t = getDict(p.locale).daily;
    const url = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://homebrain-jade.vercel.app").replace(/\/$/, "")}/weekly`;
    if (pushAllowed({ ...p, digest: false }, null, now)) await sendPush(db, p.user_id, { title: t.weeklyTitle, body: t.weeklyBody, url: "/weekly" });
    if (p.email) await sendEmail(p.email, t.weeklyTitle, `${t.weeklyBody}\n\n${url}`);
    sent.push(`weekly:${p.user_id}`);
  }
  return sent;
}

/** Last day of the month at 20:00: where the month's money went, once per person (roadmap 3.6). */
async function monthEndSummary(db: Admin, people: Profile[], now: Date) {
  const sent: string[] = [];
  const homes = new Map<string, Profile[]>();
  for (const p of people) if (p.household_id) homes.set(p.household_id, [...(homes.get(p.household_id) ?? []), p]);
  for (const [home, members] of homes) {
    const tz = members[0].timezone;
    const today = todayKey(tz, now);
    if (addDays(today, 1).slice(5, 7) === today.slice(5, 7) || !inWindow(minuteOfDay(zonedParts(now, tz)), "20:00")) continue;
    const month = await loadMonth(db, home, today.slice(0, 7), tz);
    if (month.total <= 0) continue;
    for (const m of members) {
      if (!pushAllowed({ ...m, digest: false }, null, now) || (await sentToday(db, m, "money", now))) continue;
      await markSent(db, m, "money");
      const t = getDict(m.locale).daily;
      const top = month.byCategory[0];
      const cats = getDict(m.locale).spend.categories;
      await sendPush(db, m.user_id, { title: fill(t.moneyTitle, { total: `₪${Math.round(month.total)}` }), body: top ? fill(t.moneyBody, { category: cats[top.category] ?? top.category, amount: `₪${Math.round(top.amount)}` }) : "", url: "/money" });
      sent.push(`money:${m.user_id}`);
    }
  }
  return sent;
}

/** Documents, the shelter kit, warranties: a heads-up 60, 30 and 7 days before the expiry date, between 09:00 and 21:00 (roadmap 3.7). */
async function expiryAlerts(db: Admin, people: Profile[], now: Date) {
  const { data: spaces } = await db.from("sections").select("id,household_id,owner_id,schema,icon,template").in("template", EXPIRY_TEMPLATES).returns<{ id: string; household_id: string; owner_id: string | null; schema: PropertyDef[]; icon: string; template: string }[]>();
  const sent: string[] = [];
  for (const s of spaces ?? []) {
    const dateProp = s.schema.find((p) => p.type === "date");
    if (!dateProp) continue;
    const members = people.filter((p) => p.household_id === s.household_id && (!s.owner_id || p.user_id === s.owner_id));
    const tz = members[0]?.timezone ?? "Asia/Jerusalem";
    const hour = zonedParts(now, tz).hour;
    if (hour < 9 || hour >= 21) continue;
    const today = todayKey(tz, now);
    const { data: items } = await db.from("items").select("id,title,props").eq("section_id", s.id).eq("done", false);
    for (const item of items ?? []) {
      const expires = item.props?.[dateProp.id];
      if (typeof expires !== "string" || !expires) continue;
      const state = (item.props[EXPIRY_PROP] ?? null) as ExpirySent | null;
      const stage = expiryStage(expires, today, state);
      if (!stage) continue;
      const day = expires.slice(0, 10);
      const next: ExpirySent = { for: day, sent: [...(state?.for === day ? state.sent : []), stage] };
      await db.from("items").update({ props: { ...item.props, [EXPIRY_PROP]: next } }).eq("id", item.id);
      for (const m of members) {
        if (!pushAllowed(m, s.id, now)) continue;
        const t = getDict(m.locale).daily;
        const warranty = s.template === "receipts";
        await sendPush(db, m.user_id, {
          title: `${s.icon} ${fill(warranty ? t.warrantyTitle : t.expiryTitle, { title: item.title })}`,
          body: fill(warranty ? t.warrantyBody : t.expiryBody, { n: stage, date: day }),
          url: `/sections/${s.id}`,
        });
      }
      sent.push(`expiry:${item.id}:${stage}`);
    }
  }
  return sent;
}

/** "Food runs out in ~5 days" once per bag, to everyone in the home, between 09:00 and 21:00. */
async function foodAlerts(db: Admin, people: Profile[], now: Date) {
  const { data: pets } = await db.from("pets").select("*").not("bag_started", "is", null).returns<Pet[]>();
  const sent: string[] = [];
  for (const pet of pets ?? []) {
    if (pet.food_alerted_bag === pet.bag_started) continue;
    const members = people.filter((p) => p.household_id === pet.household_id);
    const tz = members[0]?.timezone ?? "Asia/Jerusalem";
    const hour = zonedParts(now, tz).hour;
    const left = foodDaysLeft(pet, todayKey(tz, now));
    if (left === null || left > 5 || hour < 9 || hour >= 21) continue;
    await db.from("pets").update({ food_alerted_bag: pet.bag_started }).eq("id", pet.id);
    for (const m of members) {
      const t = getDict(m.locale).daily;
      await sendPush(db, m.user_id, { title: `${pet.emoji} ${fill(t.foodTitle, { name: pet.name })}`, body: fill(t.foodBody, { n: left }), url: `/pets/${pet.id}` });
    }
    sent.push(`food:${pet.id}`);
  }
  return sent;
}
