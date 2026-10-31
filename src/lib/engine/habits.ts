// Tracker ("habit") logic: schedules, reminders, streaks. Pure functions over
// local calendar days ("YYYY-MM-DD"), so they behave the same on server and phone.
import { z } from "zod";
import { localDateKey, zonedTimeToUtc } from "./time";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const habitSchema = z.object({
  repeat: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("interval"), every: z.number().int().min(1).max(365), start: dayKey }),
    z.object({ kind: z.literal("weekly"), days: z.array(z.number().int().min(0).max(6)).min(1) }),
    // Day of month (clamped to short months), every N months from `start`'s month: rent, bills, arnona.
    z.object({ kind: z.literal("monthly"), day: z.number().int().min(1).max(31), every: z.number().int().min(1).max(12), start: dayKey }),
  ]),
  time: hhmm,
  /** Evening "don't break your streak" reminder when a due session isn't done yet. */
  nudge: z.boolean().default(true),
  /** Outdoors (dog walks…): reminders mention rain/heat at that hour. */
  outdoor: z.boolean().default(false),
  /** Who's on it. Missing = whoever owns/created the item (legacy behaviour). */
  assign: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("person"), userId: z.string() }),
      z.object({ kind: z.literal("both") }),
      // Takes turns day by day through `users`, counted from `start`.
      z.object({ kind: z.literal("alternate"), users: z.array(z.string()).min(2), start: dayKey }),
    ])
    .optional(),
});
export type Habit = z.infer<typeof habitSchema>;

export const NUDGE_TIME = "20:00";
/** Where the schedule lives on an item. */
export const HABIT_PROP = "_habit";

export function readHabit(props: Record<string, unknown>): Habit | null {
  const parsed = habitSchema.safeParse(props[HABIT_PROP]);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Day arithmetic on "YYYY-MM-DD" keys (UTC-anchored, so no DST surprises)
// ---------------------------------------------------------------------------

const toUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * 86400000);
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86400000);
}

export function weekdayOf(day: string): number {
  return new Date(toUtc(day)).getUTCDay();
}

export function todayKey(timeZone: string, now = new Date()): string {
  return localDateKey(now, timeZone);
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export function isDue(habit: Habit, day: string): boolean {
  if (habit.repeat.kind === "weekly") return habit.repeat.days.includes(weekdayOf(day));
  if (habit.repeat.kind === "monthly") {
    const [y, m, d] = [+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10)];
    const start = habit.repeat.start;
    const months = (y - +start.slice(0, 4)) * 12 + (m - +start.slice(5, 7));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return months >= 0 && months % habit.repeat.every === 0 && d === Math.min(habit.repeat.day, lastDay) && diffDays(start, day) >= 0;
  }
  const diff = diffDays(habit.repeat.start, day);
  return diff >= 0 && diff % habit.repeat.every === 0;
}

/** First due day on or after `from` (within ~13 months), or null. */
export function nextDueDay(habit: Habit, from: string): string | null {
  for (let i = 0; i < 400; i++) {
    const day = addDays(from, i);
    if (isDue(habit, day)) return day;
  }
  return null;
}

export function dueDaysBetween(habit: Habit, from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; diffDays(day, to) >= 0; day = addDays(day, 1)) if (isDue(habit, day)) days.push(day);
  return days;
}

export interface Reminder {
  at: Date;
  kind: "main" | "nudge";
  day: string;
}

/**
 * Next reminder strictly after `after`: the session time on each due day, plus
 * an evening nudge if that day's session isn't checked in yet.
 */
export function nextReminder(habit: Habit, after: Date, timeZone: string, isDone: (day: string) => boolean): Reminder | null {
  const start = todayKey(timeZone, after);
  for (let i = 0; i < 400; i++) {
    const day = addDays(start, i);
    if (!isDue(habit, day) || isDone(day)) continue;
    const slots: Reminder["kind"][] = habit.nudge && habit.time < NUDGE_TIME ? ["main", "nudge"] : ["main"];
    for (const kind of slots) {
      const [h, m] = (kind === "main" ? habit.time : NUDGE_TIME).split(":").map(Number);
      const at = zonedTimeToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), h, m, timeZone);
      if (at.getTime() > after.getTime()) return { at, kind, day };
    }
  }
  return null;
}

/**
 * Who should do (and be reminded about) a session on `day`.
 * `members` are the household's user ids; `fallback` is the legacy target.
 */
export function assigneesFor(habit: Habit, day: string, members: string[], fallback: string | null): string[] {
  const a = habit.assign;
  if (!a) return fallback ? [fallback] : [];
  if (a.kind === "person") return [a.userId];
  if (a.kind === "both") return members;
  const turn = ((diffDays(a.start, day) % a.users.length) + a.users.length) % a.users.length;
  return [a.users[turn]];
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface Checkin {
  day: string;
  status: "done" | "skipped";
}

export interface HabitStats {
  streak: number;
  best: number;
  /** Done ÷ due over the last 30 days (0–100), null when nothing was due yet. */
  rate: number | null;
  total: number;
  dueToday: boolean;
  doneToday: boolean;
  nextDue: string | null;
}

/**
 * Streak = consecutive due sessions done. "Skipped" is a freeze: it neither
 * breaks nor extends the streak. Today only counts once it's done.
 * Without a schedule every day counts as due.
 */
export function habitStats(habit: Habit | null, checkins: Checkin[], today: string): HabitStats {
  const done = new Set(checkins.filter((c) => c.status === "done").map((c) => c.day));
  const skipped = new Set(checkins.filter((c) => c.status === "skipped").map((c) => c.day));
  const due = (day: string) => (habit ? isDue(habit, day) : true);

  let streak = 0;
  for (let i = 0; i < 730; i++) {
    const day = addDays(today, -i);
    if (!due(day) || skipped.has(day)) continue;
    if (done.has(day)) streak++;
    else if (day === today) continue;
    else break;
  }

  const earliest = [...done, ...skipped].sort()[0];
  const startCandidates = [earliest, habit && habit.repeat.kind !== "weekly" ? habit.repeat.start : undefined].filter(Boolean) as string[];
  const firstDay = startCandidates.sort()[0];
  let best = streak;
  if (firstDay && diffDays(firstDay, today) >= 0) {
    let run = 0;
    for (let day = firstDay; diffDays(day, today) >= 0; day = addDays(day, 1)) {
      if (!due(day) || skipped.has(day)) continue;
      if (done.has(day)) best = Math.max(best, ++run);
      else if (day !== today) run = 0;
    }
  }

  let dueCount = 0;
  let doneCount = 0;
  for (let i = 0; i < 30; i++) {
    const day = addDays(today, -i);
    if (!due(day) || skipped.has(day)) continue;
    if (day === today && !done.has(day)) continue;
    if (habit && habit.repeat.kind !== "weekly" && diffDays(habit.repeat.start, day) < 0) continue;
    dueCount++;
    if (done.has(day)) doneCount++;
  }

  return {
    streak,
    best,
    rate: dueCount ? Math.round((doneCount / dueCount) * 100) : null,
    total: done.size,
    dueToday: due(today),
    doneToday: done.has(today),
    nextDue: habit ? nextDueDay(habit, done.has(today) ? addDays(today, 1) : today) : null,
  };
}

export type HeatCell = { day: string; state: "done" | "skipped" | "missed" | "due" | "rest" | "future" };

/** Last `weeks` weeks ending this week (Sun–Sat columns), for the calendar heatmap. */
export function heatmap(habit: Habit | null, checkins: Checkin[], today: string, weeks = 12): HeatCell[] {
  const end = addDays(today, 6 - weekdayOf(today));
  return dayCells(habit, checkins, addDays(end, -(weeks * 7 - 1)), end, today);
}

/** A month as calendar weeks (Sun–Sat); days outside the month are still filled in, marked `outside`. */
export function monthGrid(habit: Habit | null, checkins: Checkin[], month: string, today: string): (HeatCell & { outside: boolean })[] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const cells = dayCells(habit, checkins, addDays(first, -weekdayOf(first)), addDays(last, 6 - weekdayOf(last)), today);
  return cells.map((c) => ({ ...c, outside: !c.day.startsWith(month) }));
}

function dayCells(habit: Habit | null, checkins: Checkin[], start: string, end: string, today: string): HeatCell[] {
  const byDay = new Map(checkins.map((c) => [c.day, c.status]));
  const cells: HeatCell[] = [];
  for (let day = start; diffDays(day, end) >= 0; day = addDays(day, 1)) {
    const status = byDay.get(day);
    const isDueDay = habit ? isDue(habit, day) : false;
    const future = diffDays(today, day) > 0;
    let state: HeatCell["state"];
    if (status) state = status;
    else if (future) state = isDueDay ? "due" : "future";
    else if (isDueDay && day !== today && !(habit && habit.repeat.kind !== "weekly" && diffDays(habit.repeat.start, day) < 0)) state = "missed";
    else state = isDueDay ? "due" : "rest";
    cells.push({ day, state });
  }
  return cells;
}
