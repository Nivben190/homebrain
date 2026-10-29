// Calmer notifications (roadmap 2.6). Reminders still write their card; these
// rules only decide whether the phone buzzes now.
import { minuteOfDay, parseHHmm, zonedParts } from "@/lib/engine/time";

export interface CalmPrefs {
  quiet_from: string | null;
  quiet_to: string | null;
  muted_sections: string[] | null;
  digest: boolean;
  timezone: string;
}

/** True when `minute` (of the local day) falls in from–to, which may cross midnight. */
export function inQuietHours(minute: number, from: string | null, to: string | null) {
  if (!from || !to) return false;
  const a = minuteOfDay(parseHHmm(from.slice(0, 5)));
  const b = minuteOfDay(parseHHmm(to.slice(0, 5)));
  if (a === b) return false;
  return a < b ? minute >= a && minute < b : minute >= a || minute < b;
}

export function pushAllowed(p: CalmPrefs, sectionId: string | null, now = new Date()) {
  if (p.digest) return false;
  if (sectionId && p.muted_sections?.includes(sectionId)) return false;
  return !inQuietHours(minuteOfDay(zonedParts(now, p.timezone)), p.quiet_from, p.quiet_to);
}
