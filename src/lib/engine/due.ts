/** Item prop holding how many minutes before its due time to remind (absent = no reminder). */
export const REMIND_PROP = "_remind";

export const LEAD_OPTIONS = [0, 60, 1440] as const;

export function readLead(props: Record<string, unknown>): number | null {
  const v = props[REMIND_PROP];
  return typeof v === "number" && v >= 0 ? v : null;
}

/**
 * When a dated item should remind: `lead` minutes before it's due. Null when
 * there's no date, no reminder chosen, or that moment has already passed.
 */
export function dueReminderAt(dueAt: string | null, lead: number | null, now = new Date()): string | null {
  if (!dueAt || lead === null) return null;
  const at = new Date(new Date(dueAt).getTime() - lead * 60000);
  return at.getTime() > now.getTime() ? at.toISOString() : null;
}
