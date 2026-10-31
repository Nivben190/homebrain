// Reminder calendar ("dates" spaces): an item is a date — once, monthly, every
// two months (Israeli water/electricity/arnona bills) or yearly — and on that day it alerts every few hours until someone says it's
// handled ("No more needed"). Optionally a heads-up some days before, and
// optionally it keeps nagging on the following days while still open.
// Pure functions over local "YYYY-MM-DD" days, like habits.ts.
import { z } from "zod";
import { addDays, diffDays, todayKey } from "./habits";
import { zonedTimeToUtc } from "./time";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dateSpecSchema = z.object({
  date: dayKey,
  repeat: z.enum(["once", "monthly", "bimonthly", "yearly"]).default("once"),
  /** Alert window on the day, and hours between alerts (0 = a single alert at `from`). */
  from: hhmm.default("09:00"),
  until: hhmm.default("21:00"),
  every: z.number().int().min(0).max(12).default(2),
  /** One heads-up alert this many days before (0 = none). */
  ahead: z.number().int().min(0).max(30).default(0),
  /** Still open after the day? Keep alerting on the next days (up to CARRY_DAYS). */
  carry: z.boolean().default(false),
  /** Who gets the alerts. Missing = everyone who can see the space. */
  assign: z.object({ kind: z.literal("person"), userId: z.string() }).optional(),
});
export type DateSpec = z.infer<typeof dateSpecSchema>;

/** Where the date lives on an item. */
export const DATES_PROP = "_dates";
export const CARRY_DAYS = 14;

export function readDate(props: Record<string, unknown>): DateSpec | null {
  const parsed = dateSpecSchema.safeParse(props[DATES_PROP]);
  return parsed.success ? parsed.data : null;
}

export function defaultDate(day: string): DateSpec {
  return { date: day, repeat: "once", from: "09:00", until: "21:00", every: 2, ahead: 0, carry: false };
}

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Is `day` one of the spec's dates? Day 31 / Feb 29 fall back to the month's last day. */
export function occursOn(spec: DateSpec, day: string): boolean {
  if (diffDays(spec.date, day) < 0) return false;
  if (spec.repeat === "once") return day === spec.date;
  const [y, m, d] = [+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10)];
  if (spec.repeat === "yearly" && m !== +spec.date.slice(5, 7)) return false;
  if (spec.repeat === "bimonthly" && (y * 12 + m - (+spec.date.slice(0, 4) * 12 + +spec.date.slice(5, 7))) % 2 !== 0) return false;
  return d === Math.min(+spec.date.slice(8, 10), lastDayOfMonth(y, m));
}

/** First date on or after `from` (within ~13 months), or null. */
export function nextOccurrence(spec: DateSpec, from: string): string | null {
  if (spec.repeat === "once") return diffDays(from, spec.date) >= 0 ? spec.date : null;
  for (let i = 0; i < 400; i++) if (occursOn(spec, addDays(from, i))) return addDays(from, i);
  return null;
}

/** Latest date on or before `day`, or null. */
export function lastOccurrence(spec: DateSpec, day: string): string | null {
  if (spec.repeat === "once") return diffDays(spec.date, day) >= 0 ? spec.date : null;
  for (let i = 0; i < 400; i++) if (occursOn(spec, addDays(day, -i))) return addDays(day, -i);
  return null;
}

/** Alert times on an active day: from, from+every h, … up to until. */
export function alertTimes(spec: DateSpec): string[] {
  const [fh, fm] = spec.from.split(":").map(Number);
  const [uh, um] = spec.until.split(":").map(Number);
  const start = fh * 60 + fm;
  const end = Math.max(start, uh * 60 + um);
  if (!spec.every) return [spec.from];
  const out: string[] = [];
  for (let t = start; t <= end; t += spec.every * 60) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  return out;
}

export interface DateReminder {
  at: Date;
  /** "day" on the date, "ahead" heads-up before it, "carry" after it while open. */
  kind: "day" | "ahead" | "carry";
  /** Local day the alert is on. */
  day: string;
  /** The date this alert is about (what "No more needed" marks handled). */
  occurrence: string;
}

/**
 * Next alert strictly after `after`. `isHandled(occurrence)` says whether a date
 * was already marked "No more needed".
 */
export function nextDateReminder(spec: DateSpec, after: Date, timeZone: string, isHandled: (occurrence: string) => boolean): DateReminder | null {
  const start = todayKey(timeZone, after);
  const times = alertTimes(spec);
  const at = (day: string, time: string) => {
    const [h, m] = time.split(":").map(Number);
    return zonedTimeToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), h, m, timeZone);
  };
  for (let i = 0; i < 400; i++) {
    const day = addDays(start, i);
    const slots: DateReminder[] = [];
    if (occursOn(spec, day) && !isHandled(day)) for (const time of times) slots.push({ at: at(day, time), kind: "day", day, occurrence: day });
    else if (spec.carry) {
      const prev = lastOccurrence(spec, addDays(day, -1));
      if (prev && !isHandled(prev) && diffDays(prev, day) <= CARRY_DAYS) for (const time of times) slots.push({ at: at(day, time), kind: "carry", day, occurrence: prev });
    }
    if (spec.ahead > 0) {
      const target = addDays(day, spec.ahead);
      if (occursOn(spec, target) && !isHandled(target)) slots.push({ at: at(day, spec.from), kind: "ahead", day, occurrence: target });
    }
    const next = slots.filter((s) => s.at.getTime() > after.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    if (next) return next;
    // Once-only dates have nothing left after their carry window.
    if (spec.repeat === "once" && diffDays(spec.date, day) > (spec.carry ? CARRY_DAYS : 0)) return null;
  }
  return null;
}

/**
 * What to store on the item: when the next alert fires (items.remind_at) and the
 * date it's about (items.due_at, at the alert window's start) so it shows in
 * "Due soon".
 */
export function datePlan(spec: DateSpec, now: Date, timeZone: string, isHandled: (occurrence: string) => boolean): { remindAt: Date | null; dueAt: Date | null } {
  const next = nextDateReminder(spec, now, timeZone, isHandled);
  const occ = openOccurrence(spec, todayKey(timeZone, now), isHandled);
  const [h, m] = spec.from.split(":").map(Number);
  const dueAt = occ ? zonedTimeToUtc(+occ.slice(0, 4), +occ.slice(5, 7), +occ.slice(8, 10), h, m, timeZone) : null;
  return { remindAt: next?.at ?? null, dueAt };
}

/** The date that still needs handling: a carried/today one, else the next unhandled one. */
export function openOccurrence(spec: DateSpec, today: string, isHandled: (occurrence: string) => boolean): string | null {
  let occ = currentOccurrence(spec, today, isHandled);
  for (let i = 0; occ && isHandled(occ) && i < 24; i++) occ = nextOccurrence(spec, addDays(occ, 1));
  return occ && !isHandled(occ) ? occ : null;
}

/**
 * The date a "No more needed" tap on `today` refers to: today's or a still-open
 * earlier one (carry), else the next one coming up (heads-up).
 */
export function currentOccurrence(spec: DateSpec, today: string, isHandled: (occurrence: string) => boolean): string | null {
  if (occursOn(spec, today)) return today;
  const prev = lastOccurrence(spec, today);
  if (spec.carry && prev && !isHandled(prev) && diffDays(prev, today) <= CARRY_DAYS) return prev;
  return nextOccurrence(spec, today);
}
