import type { Condition, Trigger } from "./types";
import { localDateKey, minuteOfDay, parseHHmm, zonedParts, zonedTimeToUtc } from "./time";

/**
 * Next instant strictly after `after` at which a schedule trigger fires, or null
 * for event triggers (those are driven by webhooks, not the clock).
 */
export function nextRunAt(trigger: Trigger, after: Date, timeZone: string): Date | null {
  if (trigger.type !== "schedule") return null;
  const times = [...trigger.times].sort();
  const days = new Set(trigger.days);
  const start = zonedParts(after, timeZone);

  // Walk forward day by day in local time; 8 days covers any weekly pattern.
  for (let offset = 0; offset < 8; offset++) {
    // Use noon UTC as an anchor to step calendar days without DST surprises.
    const anchor = new Date(Date.UTC(start.year, start.month - 1, start.day + offset, 12));
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth() + 1;
    const d = anchor.getUTCDate();
    if (!days.has(anchor.getUTCDay())) continue;
    for (const t of times) {
      const { hour, minute } = parseHHmm(t);
      const candidate = zonedTimeToUtc(y, m, d, hour, minute, timeZone);
      if (candidate.getTime() > after.getTime()) return candidate;
    }
  }
  return null;
}

export interface ConditionContext {
  now: Date;
  timeZone: string;
  /** When this automation last fired for this user, if ever. */
  lastFiredAt: Date | null;
}

/** All conditions must pass. */
export function conditionsPass(conditions: Condition[], ctx: ConditionContext): boolean {
  const local = zonedParts(ctx.now, ctx.timeZone);
  return conditions.every((c) => {
    switch (c.type) {
      case "days":
        return c.days.includes(local.weekday);
      case "time_window": {
        const now = minuteOfDay(local);
        const from = minuteOfDay(parseHHmm(c.from));
        const to = minuteOfDay(parseHHmm(c.to));
        // Windows may wrap midnight, e.g. 22:00-02:00.
        return from <= to ? now >= from && now <= to : now >= from || now <= to;
      }
      case "once_per_day":
        return (
          ctx.lastFiredAt === null ||
          localDateKey(ctx.lastFiredAt, ctx.timeZone) !== localDateKey(ctx.now, ctx.timeZone)
        );
    }
  });
}
