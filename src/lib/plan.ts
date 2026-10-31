// Plans: a goal over a few weeks ("3 workouts a week for 8 weeks"), the
// sessions planned on set weekdays, and what was really done. The spec lives in
// props._plan; a session done is that day's check-in, with what was done (sets,
// reps, weight, minutes, how it felt) in checkins.data. Weeks run Sunday to
// Saturday, Israeli style. Pure functions over local "YYYY-MM-DD" days.
import { z } from "zod";
import type { Locale } from "@/i18n";
import { addDays, diffDays, NUDGE_TIME, todayKey, weekdayOf } from "./engine/habits";
import { zonedTimeToUtc } from "./engine/time";

export const PLAN_PROP = "_plan";
/** Saturday evening: the week is looked back on, kept or missed. */
export const REVIEW_TIME = "21:00";
/** A plan is kept when at least this share of its weeks were. */
export const KEPT_SHARE = 0.75;
/** Sessions can be logged this many days late. */
export const LOG_DAYS_BACK = 2;

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const num = z.number().finite().min(0).max(100000);

export const stepSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  sets: z.number().int().min(1).max(50).optional(),
  reps: z.number().int().min(1).max(1000).optional(),
  amount: num.optional(),
  unit: z.string().trim().max(12).optional(),
});
export type PlanStep = z.infer<typeof stepSchema>;

export const sessionSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  /** Weekdays it's planned on, 0 = Sunday. */
  days: z.array(z.number().int().min(0).max(6)).max(7),
  steps: z.array(stepSchema).max(30).default([]),
});
export type PlanSession = z.infer<typeof sessionSchema>;

export const planSchema = z.object({
  why: z.string().trim().max(200).optional(),
  /** Sunday of the first week. */
  start: dayKey,
  /** The day it was made: earlier days of the first week don't count. */
  from: dayKey,
  weeks: z.number().int().min(1).max(52),
  /** Sessions a week to keep the week. */
  perWeek: z.number().int().min(1).max(14),
  time: hhmm,
  nudge: z.boolean().default(true),
  /** What the one who committed owes when a week is missed. */
  stake: z.string().trim().max(120).optional(),
  sessions: z.array(sessionSchema).min(1).max(7),
  /** A planned session moved to another day of the same week. */
  moves: z.array(z.object({ session: z.string(), from: dayKey, to: dayKey })).default([]),
  /** Weeks already looked back on: week's Sunday → sessions done. */
  reviewed: z.record(dayKey, z.number()).default({}),
  result: z.enum(["kept", "broken"]).optional(),
  lesson: z.string().trim().max(300).optional(),
});
export type PlanSpec = z.infer<typeof planSchema>;

/** What was done in one session, kept on the day's check-in. */
export const logSchema = z.object({
  session: z.string().max(40).optional(),
  steps: z
    .array(
      z.object({
        id: z.string().max(40),
        done: z.boolean(),
        sets: z.number().int().min(0).max(50).optional(),
        reps: z.number().int().min(0).max(1000).optional(),
        amount: num.optional(),
      }),
    )
    .max(30)
    .default([]),
  minutes: z.number().int().min(1).max(600).optional(),
  /** 1 (awful) … 5 (great). */
  feel: z.number().int().min(1).max(5).optional(),
});
export type PlanLog = z.infer<typeof logSchema>;

/** A check-in as the plan sees it. */
export interface PlanCheckin {
  id?: string;
  day: string;
  status: "done" | "skipped";
  user_id?: string | null;
  note?: string | null;
  data?: unknown;
  reactions?: Record<string, string> | null;
}

export function readPlan(props: Record<string, unknown>): PlanSpec | null {
  const parsed = planSchema.safeParse(props[PLAN_PROP]);
  return parsed.success ? parsed.data : null;
}

export function readLog(data: unknown): PlanLog | null {
  const parsed = logSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export const planProps = (props: Record<string, unknown>, spec: PlanSpec) => ({ ...props, [PLAN_PROP]: spec });

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** The Sunday of the week `day` is in. */
export const weekOf = (day: string) => addDays(day, -weekdayOf(day));
export const lastDay = (spec: PlanSpec) => addDays(spec.start, spec.weeks * 7 - 1);
/** 1-based week of the plan, or 0 before it / weeks+1 after it. */
export function weekNumber(spec: PlanSpec, day: string) {
  const d = diffDays(spec.start, day);
  if (d < 0) return 0;
  return Math.min(Math.floor(d / 7) + 1, spec.weeks + 1);
}
export const weekStarts = (spec: PlanSpec) => Array.from({ length: spec.weeks }, (_, i) => addDays(spec.start, i * 7));
const inPlan = (spec: PlanSpec, day: string) => diffDays(spec.from, day) >= 0 && diffDays(day, lastDay(spec)) >= 0;

/** The session planned on `day` (after moves), or null. */
export function sessionOn(spec: PlanSpec, day: string): PlanSession | null {
  if (!inPlan(spec, day)) return null;
  const movedIn = spec.moves.find((m) => m.to === day);
  if (movedIn) return spec.sessions.find((s) => s.id === movedIn.session) ?? null;
  if (spec.moves.some((m) => m.from === day)) return null;
  return spec.sessions.find((s) => s.days.includes(weekdayOf(day))) ?? null;
}

/** Sessions needed to keep this week: fewer in a first week that started midway. */
export function weekTarget(spec: PlanSpec, week: string) {
  if (diffDays(spec.from, addDays(week, 6)) < 0) return 0;
  if (diffDays(spec.from, week) >= 0) return spec.perWeek;
  let planned = 0;
  for (let i = 0; i < 7; i++) if (sessionOn(spec, addDays(week, i))) planned++;
  return Math.min(spec.perWeek, planned);
}

export type DayState = "done" | "extra" | "skipped" | "missed" | "today" | "planned" | "rest" | "out";

export interface WeekView {
  week: string;
  number: number;
  target: number;
  done: number;
  days: { day: string; session: PlanSession | null; state: DayState; checkin: PlanCheckin | null }[];
  /** kept / missed once decided (reached, or the week is over); null while it can still go either way. */
  result: "kept" | "missed" | null;
}

export function weekView(spec: PlanSpec, checkins: PlanCheckin[], week: string, today: string): WeekView {
  const byDay = new Map(checkins.map((c) => [c.day, c]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(week, i);
    const session = sessionOn(spec, day);
    const checkin = byDay.get(day) ?? null;
    let state: DayState;
    if (!inPlan(spec, day)) state = "out";
    else if (checkin?.status === "done") state = session ? "done" : "extra";
    else if (checkin?.status === "skipped") state = "skipped";
    else if (!session) state = "rest";
    else if (day === today) state = "today";
    else state = diffDays(day, today) > 0 ? "missed" : "planned";
    return { day, session, state, checkin };
  });
  const done = days.filter((d) => d.state === "done" || d.state === "extra").length;
  const target = weekTarget(spec, week);
  const over = diffDays(addDays(week, 6), today) > 0;
  const result = target === 0 ? null : done >= target ? "kept" : over ? "missed" : null;
  return { week, number: weekNumber(spec, week), target, done, days, result };
}

export interface PlanProgress {
  /** The week shown now: this one, or the last one once the plan is over. */
  current: WeekView;
  weeks: WeekView[];
  kept: number;
  missed: number;
  /** Weeks kept in a row, up to the last decided one. */
  streak: number;
  sessions: number;
  over: boolean;
  /** Where it's heading once over (or already settled). */
  result: "kept" | "broken" | null;
}

export function planProgress(spec: PlanSpec, checkins: PlanCheckin[], today: string): PlanProgress {
  const weeks = weekStarts(spec).map((w) => weekView(spec, checkins, w, today));
  const counted = weeks.filter((w) => w.target > 0);
  const kept = counted.filter((w) => w.result === "kept").length;
  const missed = counted.filter((w) => w.result === "missed").length;
  let streak = 0;
  for (const w of [...counted].reverse()) {
    if (w.result === null) continue;
    if (w.result === "kept") streak++;
    else break;
  }
  const over = diffDays(lastDay(spec), today) > 0;
  const thisWeek = weeks.find((w) => w.week === weekOf(today));
  const current = thisWeek ?? (over ? weeks[weeks.length - 1] : weeks[0]);
  const result = spec.result ?? (over && counted.length ? (kept / counted.length >= KEPT_SHARE ? "kept" : "broken") : null);
  return { current, weeks, kept, missed, streak, sessions: checkins.filter((c) => c.status === "done" && inPlan(spec, c.day)).length, over, result };
}

/** Days a planned session can move to: later this week (from today), not already planned or done. */
export function moveTargets(spec: PlanSpec, checkins: PlanCheckin[], from: string, today: string): string[] {
  const taken = new Set(checkins.map((c) => c.day));
  const week = weekOf(from);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(week, i);
    if (day === from || diffDays(today, day) < 0 || !inPlan(spec, day) || taken.has(day) || sessionOn(spec, day)) continue;
    out.push(day);
  }
  return out;
}

/** The spec after moving `from`'s session to `to`. */
export function moveSession(spec: PlanSpec, from: string, to: string): PlanSpec | null {
  const session = sessionOn(spec, from);
  if (!session || weekOf(from) !== weekOf(to) || sessionOn(spec, to)) return null;
  // Moving a session that was itself moved replaces that move.
  const moves = spec.moves.filter((m) => m.to !== from);
  const original = spec.moves.find((m) => m.to === from)?.from ?? from;
  if (original !== to) moves.push({ session: session.id, from: original, to });
  // Keep moves of recent weeks only.
  return { ...spec, moves: moves.filter((m) => diffDays(addDays(weekOf(to), -14), m.to) >= 0) };
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface PlanReminder {
  at: Date;
  kind: "main" | "nudge" | "review";
  day: string;
}

/**
 * Next thing to say strictly after `after`: the session time on a planned day
 * (unless that day is handled or the week is already kept), an evening nudge if
 * it's still not done, and the Saturday-evening look back on each week.
 */
export function nextPlanReminder(spec: PlanSpec, checkins: PlanCheckin[], after: Date, timeZone: string): PlanReminder | null {
  if (spec.result) return null;
  const handled = new Set(checkins.map((c) => c.day));
  const today = todayKey(timeZone, after);
  const end = addDays(lastDay(spec), 1);
  const keptWeeks = new Map<string, boolean>();
  const weekKept = (day: string) => {
    const w = weekOf(day);
    if (!keptWeeks.has(w)) {
      const target = weekTarget(spec, w);
      const done = checkins.filter((c) => c.status === "done" && weekOf(c.day) === w).length;
      keptWeeks.set(w, target > 0 && done >= target);
    }
    return keptWeeks.get(w)!;
  };
  for (let day = diffDays(spec.from, today) > 0 ? today : spec.from; diffDays(day, end) >= 0; day = addDays(day, 1)) {
    const slots: [PlanReminder["kind"], string][] = [];
    if (sessionOn(spec, day) && !handled.has(day) && !weekKept(day)) {
      slots.push(["main", spec.time]);
      if (spec.nudge && spec.time < NUDGE_TIME) slots.push(["nudge", NUDGE_TIME]);
    }
    if (weekdayOf(day) === 6 && inPlan(spec, day) && spec.reviewed[weekOf(day)] === undefined) slots.push(["review", REVIEW_TIME]);
    slots.sort((a, b) => a[1].localeCompare(b[1]));
    for (const [kind, time] of slots) {
      const [h, m] = time.split(":").map(Number);
      const at = zonedTimeToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), h, m, timeZone);
      if (at.getTime() > after.getTime()) return { at, kind, day };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Progress per step
// ---------------------------------------------------------------------------

export interface StepPoint {
  day: string;
  sets?: number;
  reps?: number;
  amount?: number;
}

/** What was logged for a step, oldest first. */
export function stepHistory(checkins: PlanCheckin[], stepId: string): StepPoint[] {
  return checkins
    .filter((c) => c.status === "done")
    .flatMap((c) => {
      const s = readLog(c.data)?.steps.find((x) => x.id === stepId && x.done);
      return s && (s.amount !== undefined || s.reps !== undefined) ? [{ day: c.day, sets: s.sets, reps: s.reps, amount: s.amount }] : [];
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** The last time this session was logged, to start from those numbers. */
export function lastLog(checkins: PlanCheckin[], sessionId: string, before?: string): PlanLog | null {
  const rows = checkins
    .filter((c) => c.status === "done" && (!before || c.day < before))
    .map((c) => ({ day: c.day, log: readLog(c.data) }))
    .filter((x) => x.log?.session === sessionId && x.log.steps.length)
    .sort((a, b) => b.day.localeCompare(a.day));
  return rows[0]?.log ?? null;
}

/** "3×8 · 60 kg", "30 min", "20 pages". */
export function formatTarget(s: { sets?: number; reps?: number; amount?: number; unit?: string }) {
  const parts: string[] = [];
  if (s.sets && s.reps) parts.push(`${s.sets}×${s.reps}`);
  else if (s.reps) parts.push(`×${s.reps}`);
  else if (s.sets) parts.push(`${s.sets}×`);
  if (s.amount !== undefined) parts.push(s.unit ? `${s.amount} ${s.unit}` : String(s.amount));
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Starting points
// ---------------------------------------------------------------------------

type L = Record<Locale, string>;
interface PresetStep {
  name: L;
  sets?: number;
  reps?: number;
  amount?: number;
  unit?: L;
}
export interface PlanPreset {
  key: string;
  icon: string;
  title: L;
  why?: L;
  perWeek?: number;
  time: string;
  sessions: { name: L; days: number[]; steps: PresetStep[] }[];
}

const kg: L = { en: "kg", he: "ק״ג" };
const min: L = { en: "min", he: "דק׳" };
const sec: L = { en: "sec", he: "שנ׳" };

export const PLAN_PRESETS: PlanPreset[] = [
  {
    key: "gym",
    icon: "🏋️",
    title: { en: "Gym 3× a week", he: "חדר כושר 3 פעמים בשבוע" },
    time: "18:30",
    sessions: [
      {
        name: { en: "Push day", he: "יום דחיפה" },
        days: [0],
        steps: [
          { name: { en: "Bench press", he: "לחיצת חזה" }, sets: 3, reps: 8, amount: 40, unit: kg },
          { name: { en: "Shoulder press", he: "לחיצת כתפיים" }, sets: 3, reps: 10, amount: 10, unit: kg },
          { name: { en: "Push-ups", he: "שכיבות סמיכה" }, sets: 3, reps: 12 },
        ],
      },
      {
        name: { en: "Pull day", he: "יום משיכה" },
        days: [2],
        steps: [
          { name: { en: "Rows", he: "חתירה" }, sets: 3, reps: 10, amount: 30, unit: kg },
          { name: { en: "Lat pulldown", he: "פולי עליון" }, sets: 3, reps: 10, amount: 35, unit: kg },
          { name: { en: "Biceps curl", he: "כפיפת מרפקים" }, sets: 3, reps: 12, amount: 8, unit: kg },
        ],
      },
      {
        name: { en: "Leg day", he: "יום רגליים" },
        days: [4],
        steps: [
          { name: { en: "Squat", he: "סקוואט" }, sets: 3, reps: 8, amount: 40, unit: kg },
          { name: { en: "Lunges", he: "מכרעים" }, sets: 3, reps: 10 },
          { name: { en: "Plank", he: "פלאנק" }, sets: 3, amount: 45, unit: sec },
        ],
      },
    ],
  },
  {
    key: "run",
    icon: "🏃",
    title: { en: "Running 3× a week", he: "ריצה 3 פעמים בשבוע" },
    time: "07:00",
    sessions: [
      { name: { en: "Easy run", he: "ריצה קלה" }, days: [0, 3], steps: [{ name: { en: "Run", he: "ריצה" }, amount: 30, unit: min }] },
      { name: { en: "Long run", he: "ריצה ארוכה" }, days: [5], steps: [{ name: { en: "Distance", he: "מרחק" }, amount: 5, unit: { en: "km", he: "ק״מ" } }] },
    ],
  },
  {
    key: "home",
    icon: "🤸",
    title: { en: "Home workout 4× a week", he: "אימון בבית 4 פעמים בשבוע" },
    time: "19:00",
    sessions: [
      {
        name: { en: "Home workout", he: "אימון בבית" },
        days: [0, 1, 3, 4],
        steps: [
          { name: { en: "Squats", he: "סקוואטים" }, sets: 3, reps: 15 },
          { name: { en: "Push-ups", he: "שכיבות סמיכה" }, sets: 3, reps: 10 },
          { name: { en: "Plank", he: "פלאנק" }, sets: 3, amount: 40, unit: sec },
        ],
      },
    ],
  },
  {
    key: "study",
    icon: "📚",
    title: { en: "Study 4× a week", he: "ללמוד 4 פעמים בשבוע" },
    time: "20:00",
    sessions: [{ name: { en: "Study", he: "לימוד" }, days: [0, 1, 2, 3], steps: [{ name: { en: "Focused time", he: "זמן מרוכז" }, amount: 45, unit: min }] }],
  },
  {
    key: "read",
    icon: "📖",
    title: { en: "Read 5× a week", he: "לקרוא 5 פעמים בשבוע" },
    time: "21:30",
    sessions: [{ name: { en: "Reading", he: "קריאה" }, days: [0, 1, 2, 3, 4], steps: [{ name: { en: "Pages", he: "עמודים" }, amount: 20, unit: { en: "pages", he: "עמ׳" } }] }],
  },
  {
    key: "dog",
    icon: "🦴",
    title: { en: "Dog training 5× a week", he: "אילוף הכלב 5 פעמים בשבוע" },
    time: "18:00",
    sessions: [
      {
        name: { en: "Training", he: "אילוף" },
        days: [0, 1, 2, 3, 4],
        steps: [
          { name: { en: "Sit & stay", he: "שב והישאר" }, amount: 5, unit: min },
          { name: { en: "Recall", he: "קריאה אליי" }, amount: 5, unit: min },
        ],
      },
    ],
  },
  {
    key: "custom",
    icon: "🎯",
    title: { en: "Something else", he: "משהו אחר" },
    time: "18:00",
    sessions: [{ name: { en: "Session", he: "מפגש" }, days: [0, 2, 4], steps: [] }],
  },
];

const newId = () => Math.random().toString(36).slice(2, 10);

/** A plan from a starting point, beginning this week. */
export function planFromPreset(preset: PlanPreset, locale: Locale, today: string, weeks = 8): { title: string; spec: PlanSpec } {
  const sessions = preset.sessions.map((s) => ({
    id: newId(),
    name: s.name[locale],
    days: s.days,
    steps: s.steps.map((st) => ({ id: newId(), name: st.name[locale], sets: st.sets, reps: st.reps, amount: st.amount, unit: st.unit?.[locale] })),
  }));
  const planned = new Set(sessions.flatMap((s) => s.days)).size;
  return {
    title: preset.key === "custom" ? "" : preset.title[locale],
    spec: { start: weekOf(today), from: today, weeks, perWeek: preset.perWeek ?? Math.max(1, planned), time: preset.time, nudge: true, sessions, moves: [], reviewed: {} },
  };
}

export const newPlanId = newId;

/** Each weekday belongs to at most one session: giving it to one takes it from the others. */
export function setSessionDays(spec: PlanSpec, sessionId: string, days: number[]): PlanSpec {
  return {
    ...spec,
    sessions: spec.sessions.map((s) => (s.id === sessionId ? { ...s, days: [...days].sort() } : { ...s, days: s.days.filter((d) => !days.includes(d)) })),
  };
}
