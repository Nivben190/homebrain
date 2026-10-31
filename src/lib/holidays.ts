// Holidays worth hosting for: 21 days ahead, Today offers a Holidays & hosting space.
import type { HebcalItem } from "@/lib/jewish";
import type { Locale } from "@/i18n";
import { diffDays } from "@/lib/engine/habits";

export const HOSTING_AHEAD = 21;

const HOSTED = /^(?:Erev )?(Rosh Hashana|Yom Kippur|Sukkot|Pesach|Shavuot|Chanukah|Purim)/;

const HEBREW: Record<string, string> = {
  "Rosh Hashana": "ראש השנה",
  "Yom Kippur": "יום כיפור",
  Sukkot: "סוכות",
  Pesach: "פסח",
  Shavuot: "שבועות",
  Chanukah: "חנוכה",
  Purim: "פורים",
};

export interface HostingHoliday {
  /** Stable per holiday and year, e.g. "Pesach-2027" (dismissals key on it). */
  key: string;
  name: string;
  hebrew: string;
  day: string;
  days: number;
}

/** The first holiday worth hosting for in the next three weeks, unless the home just made a holiday space. */
export function hostingHoliday(items: HebcalItem[], today: string, recentHolidaySpace: boolean): HostingHoliday | null {
  if (recentHolidaySpace) return null;
  const found = [...items]
    .filter((i) => i.category === "holiday")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => ({ i, m: HOSTED.exec(i.title), day: i.date.slice(0, 10) }))
    .find(({ m, day }) => m && diffDays(today, day) >= 1 && diffDays(today, day) <= HOSTING_AHEAD);
  if (!found) return null;
  const name = found.m![1];
  return {
    key: `${name}-${found.day.slice(0, 4)}`,
    name,
    hebrew: HEBREW[name],
    day: found.day,
    days: diffDays(today, found.day),
  };
}

/** "Pesach 2027" / "פסח 2027": the new space's name. */
export const holidaySpaceTitle = (h: HostingHoliday, locale: Locale) => `${locale === "he" ? h.hebrew : h.name} ${h.day.slice(0, 4)}`;
