import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Automation, Job, Profile, Section } from "@/lib/db-types";
import { sendPush } from "@/lib/push";
import { sendEmail } from "@/lib/email";
import { getDict, fill } from "@/i18n";
import { alarmShortcutUrl, renderActions } from "./render";
import { addDays, assigneesFor, diffDays, habitStats, isDue, nextReminder, NUDGE_TIME, readHabit, todayKey, type Checkin } from "./habits";
import { datePlan, nextDateReminder, readDate, type DateSpec } from "./dates";
import { dailyJobs, isQuiet, sendBriefing } from "./daily";
import { DEFAULT_PLACE, getForecast, outdoorWarning, weatherAt } from "@/lib/weather";
import type { RenderedAction } from "./types";
import { conditionsPass, nextRunAt } from "./schedule";
import { referencedSections, type TemplateContext } from "./templates";
import { automationDefSchema } from "./types";
import { allowedSections, sectionRefs } from "./scope";
import { planEvent } from "./events";
import { reminderAudience } from "./audience";
import { minuteOfDay, parseHHmm, zonedParts } from "./time";

/** Schedules more than this late (e.g. after downtime) are skipped instead of fired. */
const MAX_LATENESS_MS = 30 * 60 * 1000;

type Admin = SupabaseClient;

export interface FireOutcome {
  automationId: string;
  status: "fired" | "skipped" | "invalid" | "error";
  runId?: string;
  reason?: string;
}

async function loadPeople(db: Admin, userId: string) {
  const { data: me } = await db.from("profiles").select("*").eq("user_id", userId).single<Profile>();
  if (!me) throw new Error(`profile ${userId} not found`);
  let partner: Profile | null = null;
  if (me.household_id) {
    const { data } = await db
      .from("profiles")
      .select("*")
      .eq("household_id", me.household_id)
      .neq("user_id", userId)
      .limit(1)
      .maybeSingle<Profile>();
    partner = data;
  }
  return { me, partner };
}

/** The referenced spaces this automation is allowed to touch. */
async function scopeFor(db: Admin, automation: Automation, sectionIds: string[]) {
  if (sectionIds.length === 0) return new Set<string>();
  const { data } = await db.from("sections").select("id,household_id,owner_id").in("id", sectionIds);
  return allowedSections(data ?? [], automation);
}

async function prefetchPicks(db: Admin, sectionIds: string[]) {
  const pool = new Map<string, string[]>();
  if (sectionIds.length === 0) return pool;
  const { data } = await db.from("items").select("section_id,title").in("section_id", sectionIds).eq("done", false);
  for (const row of data ?? []) {
    if (!row.title) continue;
    pool.set(row.section_id, [...(pool.get(row.section_id) ?? []), row.title]);
  }
  return pool;
}

/** Fires one automation for its target user right now. */
export async function fireAutomation(db: Admin, automation: Automation, now = new Date()): Promise<FireOutcome> {
  const parsed = automationDefSchema.safeParse(automation);
  if (!parsed.success) {
    return { automationId: automation.id, status: "invalid", reason: parsed.error.issues[0]?.message };
  }
  const def = parsed.data;
  const { me, partner } = await loadPeople(db, automation.target_user_id);

  const { data: last } = await db
    .from("runs")
    .select("fired_at")
    .eq("automation_id", automation.id)
    .eq("user_id", me.user_id)
    .order("fired_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ok = conditionsPass(def.conditions, {
    now,
    timeZone: me.timezone,
    lastFiredAt: last ? new Date(last.fired_at) : null,
  });
  if (!ok) return { automationId: automation.id, status: "skipped", reason: "conditions" };
  if (await isQuiet(me, now)) return { automationId: automation.id, status: "skipped", reason: "quiet shabbat" };

  const allowed = await scopeFor(db, automation, sectionRefs(def.actions));
  const pool = await prefetchPicks(db, referencedSections(JSON.stringify(def.actions)).filter((id) => allowed.has(id)));
  const ctx: TemplateContext = {
    me: { name: me.display_name, phone: me.phone, email: me.email },
    partner: partner ? { name: partner.display_name, phone: partner.phone, email: partner.email } : null,
    now,
    timeZone: me.timezone,
    locale: me.locale,
    pick: (id) => {
      const list = pool.get(id) ?? [];
      return list.length ? list[Math.floor(Math.random() * list.length)] : "";
    },
  };
  const out = renderActions(def.name, def.actions, ctx);

  // Emails go out first so the card can say what really happened.
  const skipped: string[] = [];
  for (const effect of out.effects) {
    if (effect.kind !== "email") continue;
    const sent = await sendEmail(effect.to, effect.subject, effect.body);
    const text = sent.ok ? `Email sent to ${effect.to}` : sent.reason === "not_configured" ? `Email not sent - email isn't set up` : `Couldn't send email to ${effect.to}`;
    out.rendered[effect.note] = { kind: "note", icon: sent.ok ? "📧" : "⚠️", text };
    if (!sent.ok) skipped.push(`email: ${sent.reason}${sent.reason === "failed" ? ` ${sent.detail}` : ""}`);
  }

  const { data: run, error } = await db
    .from("runs")
    .insert({
      automation_id: automation.id,
      user_id: me.user_id,
      household_id: automation.household_id,
      title: out.title,
      body: out.body,
      icon: def.icon,
      rendered: out.rendered,
      fired_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error || !run) return { automationId: automation.id, status: "error", reason: error?.message };

  for (const effect of out.effects) {
    if (effect.kind === "create_item") {
      if (!allowed.has(effect.sectionId)) {
        skipped.push(`create_item: space ${effect.sectionId} is outside this home`);
        continue;
      }
      await db.from("items").insert({ section_id: effect.sectionId, title: effect.title, created_by: me.user_id });
    }
  }
  await sendPush(db, me.user_id, { title: `${def.icon} ${out.title}`, body: out.body, url: `/runs/${run.id}` });

  return { automationId: automation.id, status: "fired", runId: run.id, reason: skipped.join("; ") || undefined };
}

/** Writes next_run_at for a schedule automation (null for event automations). */
export async function reschedule(db: Admin, automation: Automation, after = new Date()) {
  const { data: tz } = await db.from("profiles").select("timezone").eq("user_id", automation.target_user_id).single();
  const next = automation.enabled ? nextRunAt(automation.trigger, after, tz?.timezone ?? "Asia/Jerusalem") : null;
  await db.from("automations").update({ next_run_at: next?.toISOString() ?? null }).eq("id", automation.id);
  return next;
}

/** One engine heartbeat: fire due schedules and due delayed jobs. */
export async function tick(db: Admin, now = new Date()) {
  const outcomes: FireOutcome[] = [];

  const { data: due, error: dueErr } = await db.rpc("claim_due_schedules", { p_limit: 50 });
  if (dueErr) throw dueErr;
  for (const { automation_id, due_at } of (due ?? []) as { automation_id: string; due_at: string }[]) {
    const { data: a } = await db.from("automations").select("*").eq("id", automation_id).single<Automation>();
    if (!a) continue;
    try {
      if (now.getTime() - new Date(due_at).getTime() > MAX_LATENESS_MS) {
        outcomes.push({ automationId: a.id, status: "skipped", reason: "too late" });
      } else {
        outcomes.push(await fireAutomation(db, a, now));
      }
    } catch (e) {
      outcomes.push({ automationId: a.id, status: "error", reason: String(e) });
    }
    await reschedule(db, a, now);
  }

  outcomes.push(...(await emitFixedWakes(db, now)));
  // Briefing fallback, wrap-up, Shabbat shopping, dog food.
  for (const job of await dailyJobs(db, now)) outcomes.push({ automationId: job, status: "fired", reason: "daily" });

  const { data: dueItems, error: itemsErr } = await db.rpc("claim_due_items", { p_limit: 50 });
  if (itemsErr) throw itemsErr;
  for (const { item_id, due_at } of (dueItems ?? []) as { item_id: string; due_at: string }[]) {
    try {
      outcomes.push(await fireItemReminder(db, item_id, new Date(due_at), now));
    } catch (e) {
      outcomes.push({ automationId: item_id, status: "error", reason: String(e) });
    }
  }

  const { data: jobs, error: jobsErr } = await db.rpc("claim_due_jobs", { p_limit: 50 });
  if (jobsErr) throw jobsErr;
  for (const job of (jobs ?? []) as Job[]) {
    try {
      const { data: a } = await db.from("automations").select("*").eq("id", job.automation_id).single<Automation>();
      if (a?.enabled) outcomes.push(await fireAutomation(db, a, now));
      await db.from("jobs").update({ status: "done" }).eq("id", job.id);
    } catch (e) {
      // Retry a minute later, up to 3 attempts in all.
      const retry = (job.attempts ?? 1) < 3;
      await db
        .from("jobs")
        .update(retry ? { status: "pending", error: String(e), run_at: new Date(now.getTime() + 60_000).toISOString() } : { status: "failed", error: String(e) })
        .eq("id", job.id);
    }
  }
  return outcomes;
}

/**
 * Sends a tracker reminder (session time or evening nudge) to whoever is on it
 * today, unless the session is already checked in, then schedules the next one.
 */
export async function fireItemReminder(db: Admin, itemId: string, dueAt: Date, now = new Date()): Promise<FireOutcome> {
  const { data: item } = await db.from("items").select("*, sections(*)").eq("id", itemId).single();
  const section = item?.sections as Section | undefined;
  const spec = item ? readDate(item.props ?? {}) : null;
  if (item && section && spec && !item.done) return fireDateReminder(db, item, section, spec, dueAt, now);
  const habit = item ? readHabit(item.props ?? {}) : null;
  if (!item || !section || !habit || item.done) {
    if (item) await db.from("items").update({ remind_at: null }).eq("id", itemId);
    return { automationId: itemId, status: "skipped", reason: "no schedule" };
  }

  const { eligible, timeZone: tz } = await audienceOf(db, section);
  const today = todayKey(tz, now);
  const { data: rows } = await db.from("checkins").select("day,status").eq("item_id", itemId).gte("day", addDays(today, -400));
  const checkins = (rows ?? []) as Checkin[];
  // Done or skipped both mean "handled today": no more reminders that day.
  const done = new Set(checkins.map((c) => c.day));
  const reschedule = async () => {
    const next = nextReminder(habit, now, tz, (d) => done.has(d));
    await db.from("items").update({ remind_at: next?.at.toISOString() ?? null }).eq("id", itemId);
  };

  const late = now.getTime() - dueAt.getTime() > MAX_LATENESS_MS;
  if (late || done.has(today) || !isDue(habit, today)) {
    await reschedule();
    return { automationId: itemId, status: "skipped", reason: late ? "too late" : "not due / already done" };
  }

  const ids = assigneesFor(habit, today, eligible.map((m) => m.user_id), item.assignee_id ?? section.owner_id ?? item.created_by);
  const targets = eligible.filter((m) => ids.includes(m.user_id));
  const local = zonedParts(dueAt, tz);
  const isNudge = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}` === NUDGE_TIME && habit.time !== NUDGE_TIME;
  const stats = habitStats(habit, checkins, today);
  const snooze = new Date(now.getTime() + 15 * 60000);
  const snoozeTime = `${String(zonedParts(snooze, tz).hour).padStart(2, "0")}:${String(zonedParts(snooze, tz).minute).padStart(2, "0")}`;
  const hours = habit.outdoor && targets[0] ? ((await getForecast(targets[0].lat ?? DEFAULT_PLACE.lat, targets[0].lon ?? DEFAULT_PLACE.lon, tz))?.hours ?? []) : [];

  const fired = await sendReminders(db, section, itemId, targets, now, (target) => {
    const t = getDict(target.locale);
    const warning = habit.outdoor ? outdoorWarning(weatherAt(hours, today, habit.time), { rain: t.daily.rainAt, hot: t.daily.hotAt }) : null;
    const title = isNudge ? t.tracker.nudgeTitle : fill(t.tracker.remindTitle, { item: item.title });
    const base = isNudge
      ? fill(t.tracker.nudgeBody, { item: item.title })
      : stats.streak > 0
        ? fill(t.tracker.remindBody, { streak: stats.streak })
        : t.tracker.remindBodyNew;
    const body = warning && !isNudge ? `${warning} · ${base}` : base;
    const rendered: RenderedAction[] = [
      { kind: "done", label: t.tracker.doneButton },
      { kind: "link", icon: "⏰", label: t.tracker.snooze, href: alarmShortcutUrl(snoozeTime, item.title), external: true },
      { kind: "link", icon: section.icon, label: section.title, href: `/sections/${section.id}` },
    ];
    return { title, body, rendered };
  });
  await reschedule();
  return { automationId: itemId, status: fired ? "fired" : "skipped", reason: fired ? `${fired} people` : "quiet / nobody assigned" };
}

/** The household members a reminder about this space can reach, and their timezone. */
async function audienceOf(db: Admin, section: Section) {
  const { data: members } = await db.from("profiles").select("*").eq("household_id", section.household_id).returns<Profile[]>();
  return reminderAudience(members ?? [], section);
}

/**
 * The one path every item reminder takes: skip people in quiet hours, write
 * the card (replacing their unanswered one), push it. Returns how many got it.
 */
export async function sendReminders(
  db: Admin,
  section: Section,
  itemId: string,
  targets: Profile[],
  now: Date,
  card: (target: Profile) => { title: string; body: string; rendered: RenderedAction[] },
) {
  let fired = 0;
  for (const target of targets) {
    if (await isQuiet(target, now)) continue;
    const { title, body, rendered } = card(target);
    const run = await insertItemRun(db, { user_id: target.user_id, household_id: section.household_id, item_id: itemId, title, body, icon: section.icon, rendered, fired_at: now.toISOString() });
    if (!run) continue;
    await sendPush(db, target.user_id, { title: `${section.icon} ${title}`, body, url: `/runs/${run.id}` });
    fired++;
  }
  return fired;
}

/**
 * Adds a reminder card about an item. It replaces that person's earlier
 * unanswered card about the same item, so "Waiting for you" shows one card per
 * thing instead of a pile of repeats.
 */
async function insertItemRun(db: Admin, row: { user_id: string; household_id: string; item_id: string; title: string; body: string; icon: string; rendered: RenderedAction[]; fired_at: string }) {
  await db.from("runs").update({ acknowledged_at: row.fired_at }).eq("item_id", row.item_id).eq("user_id", row.user_id).is("acknowledged_at", null);
  const { data } = await db.from("runs").insert(row).select("id").single();
  return data as { id: string } | null;
}

/** Days marked "No more needed" for a reminder-calendar item. */
export async function handledDays(db: Admin, itemId: string): Promise<Set<string>> {
  const { data } = await db.from("checkins").select("day").eq("item_id", itemId).eq("status", "done");
  return new Set((data ?? []).map((r) => r.day as string));
}

/** Stores the next alert + upcoming date for a reminder-calendar item. */
export async function rescheduleDate(db: Admin, itemId: string, spec: DateSpec, timeZone: string, handled: Set<string>, now = new Date()) {
  const plan = datePlan(spec, now, timeZone, (d) => handled.has(d));
  await db.from("items").update({ remind_at: plan.remindAt?.toISOString() ?? null, due_at: plan.dueAt?.toISOString() ?? null }).eq("id", itemId);
}

/**
 * Sends a reminder-calendar alert (the day itself every few hours, a heads-up
 * before, or a carried-over nag after) unless that date is already handled,
 * then schedules the next one.
 */
async function fireDateReminder(db: Admin, item: { id: string; title: string; created_by: string | null }, section: Section, spec: DateSpec, dueAt: Date, now: Date): Promise<FireOutcome> {
  const { eligible, timeZone: tz } = await audienceOf(db, section);
  const handled = await handledDays(db, item.id);
  // Which alert was due: the first one after just before its time.
  const due = nextDateReminder(spec, new Date(dueAt.getTime() - 1000), tz, (d) => handled.has(d));
  const late = now.getTime() - dueAt.getTime() > MAX_LATENESS_MS;
  if (late || !due || Math.abs(due.at.getTime() - dueAt.getTime()) > 60000) {
    await rescheduleDate(db, item.id, spec, tz, handled, now);
    return { automationId: item.id, status: "skipped", reason: late ? "too late" : "handled / edited" };
  }

  const targets = spec.assign ? eligible.filter((m) => m.user_id === spec.assign!.userId) : eligible;
  const fired = await sendReminders(db, section, item.id, targets, now, (target) => {
    const t = getDict(target.locale);
    const dateLabel = new Intl.DateTimeFormat(target.locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${due.occurrence}T12:00:00Z`));
    const daysTo = diffDays(due.day, due.occurrence);
    const title =
      due.kind === "ahead" ? fill(t.dates.aheadTitle, { item: item.title, days: daysTo }) : due.kind === "carry" ? fill(t.dates.carryTitle, { item: item.title }) : fill(t.dates.todayTitle, { item: item.title });
    const body = due.kind === "ahead" ? dateLabel : due.kind === "carry" ? fill(t.dates.carryBody, { date: dateLabel }) : t.dates.todayBody;
    const rendered: RenderedAction[] = [
      { kind: "done", label: t.dates.stop, day: due.occurrence },
      { kind: "link", icon: section.icon, label: section.title, href: `/sections/${section.id}` },
    ];
    return { title, body, rendered };
  });
  await rescheduleDate(db, item.id, spec, tz, handled, now);
  return { automationId: item.id, status: fired ? "fired" : "skipped", reason: fired ? `${fired} people` : "quiet / nobody assigned" };
}

/** Users with wake_mode "fixed" get a wake event at their wake_time (once a day, 30 min grace). */
async function emitFixedWakes(db: Admin, now: Date) {
  const { data: people } = await db.from("profiles").select("user_id,timezone,wake_time").eq("wake_mode", "fixed").not("wake_time", "is", null);
  const outcomes: FireOutcome[] = [];
  for (const p of people ?? []) {
    const local = zonedParts(now, p.timezone);
    const wake = minuteOfDay(parseHHmm(String(p.wake_time).slice(0, 5)));
    const diff = minuteOfDay(local) - wake;
    if (diff < 0 || diff > 30) continue;
    const { count } = await db
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", p.user_id)
      .eq("type", "wake")
      .gte("created_at", new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString());
    if (!count) outcomes.push(...(await handleEvent(db, p.user_id, "wake", { source: "fixed" })));
  }
  return outcomes;
}

/**
 * Records an event (from iOS Shortcuts or the app) and fires or queues every
 * automation listening for it.
 */
export async function handleEvent(db: Admin, userId: string, type: string, payload: Record<string, unknown> = {}) {
  await db.from("events").insert({ user_id: userId, type, payload });
  const { data: automations } = await db
    .from("automations")
    .select("*")
    .eq("target_user_id", userId)
    .eq("enabled", true)
    .eq("trigger->>type", "event")
    .eq("trigger->>event", type)
    .returns<Automation[]>();

  const outcomes: FireOutcome[] = [];
  const plan = planEvent(automations ?? [], userId, type, new Date());
  if (plan.jobs.length) await db.from("jobs").insert(plan.jobs);
  for (const job of plan.jobs) outcomes.push({ automationId: job.automation_id, status: "skipped", reason: `queued for ${job.run_at}` });
  for (const a of plan.now) outcomes.push(await fireAutomation(db, a));
  // Waking up also sends the day's briefing (once a day).
  if (type === "wake") await sendBriefing(db, userId);
  return outcomes;
}
