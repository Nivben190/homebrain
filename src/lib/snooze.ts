// Snooze on a reminder card: it comes back as a push at the chosen time.
import { addDays, todayKey } from "@/lib/engine/habits";
import { zonedParts, zonedTimeToUtc } from "@/lib/engine/time";

export const SNOOZE_CHOICES = ["hour", "tonight", "tomorrow"] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];

const TONIGHT = { hour: 20, minute: 0 };
const TOMORROW = { hour: 8, minute: 0 };

const at = (day: string, t: { hour: number; minute: number }, timeZone: string) => zonedTimeToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), t.hour, t.minute, timeZone);

/** The choices that make sense now: "tonight" only until an hour before 20:00. */
export function snoozeChoices(now: Date, timeZone: string): SnoozeChoice[] {
  const { hour } = zonedParts(now, timeZone);
  return hour < TONIGHT.hour - 1 ? ["hour", "tonight", "tomorrow"] : ["hour", "tomorrow"];
}

/** When a snoozed reminder comes back. */
export function snoozeUntil(choice: SnoozeChoice, now: Date, timeZone: string): Date {
  const today = todayKey(timeZone, now);
  if (choice === "tonight") return at(today, TONIGHT, timeZone);
  if (choice === "tomorrow") return at(addDays(today, 1), TOMORROW, timeZone);
  return new Date(now.getTime() + 3600_000);
}
