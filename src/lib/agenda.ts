// Family calendar (roadmap 3.4): everything dated in one week, by day.
import { addDays, assigneesFor, dueDaysBetween, todayKey, type Habit } from "@/lib/engine/habits";

export type AgendaKind = "item" | "session" | "automation" | "holiday" | "google";

export interface AgendaEntry {
  day: string;
  /** HH:MM, or null for all-day. */
  time: string | null;
  title: string;
  icon: string;
  kind: AgendaKind;
  /** Member ids, for coloring by person. */
  who: string[];
  href?: string;
  /** A routine's session that was checked in, and its note. */
  status?: "done" | "skipped";
  note?: string | null;
}

export interface AgendaSources {
  /** Items with a due date, already in local day + time. */
  items: { id: string; title: string; icon: string; sectionId: string; day: string; time: string | null; who: string | null }[];
  sessions: { id: string; title: string; icon: string; sectionId: string; habit: Habit; fallback: string | null; checkins?: { day: string; status: "done" | "skipped"; note: string | null; user_id: string | null }[] }[];
  automations: { id: string; name: string; icon: string; day: string; time: string; who: string }[];
  holidays: { day: string; title: string }[];
  google: { day: string; time: string | null; title: string; who: string }[];
  members: string[];
}

/** One list per day from `from` for `days` days, all-day entries first, then by time. */
export function buildAgenda(from: string, days: number, s: AgendaSources): Map<string, AgendaEntry[]> {
  const to = addDays(from, days - 1);
  const out = new Map<string, AgendaEntry[]>();
  for (let i = 0; i < days; i++) out.set(addDays(from, i), []);
  const put = (e: AgendaEntry) => out.get(e.day)?.push(e);

  for (const i of s.items) put({ day: i.day, time: i.time, title: i.title, icon: i.icon, kind: "item", who: i.who ? [i.who] : [], href: `/sections/${i.sectionId}` });
  for (const x of s.sessions) {
    const checked = new Map((x.checkins ?? []).map((c) => [c.day, c]));
    // Planned days, and any other day it was done anyway.
    const days = new Set([...dueDaysBetween(x.habit, from, to), ...[...checked.keys()].filter((d) => d >= from && d <= to)]);
    for (const day of days) {
      const c = checked.get(day);
      const who = c?.user_id ? [c.user_id] : assigneesFor(x.habit, day, s.members, x.fallback);
      put({ day, time: x.habit.time, title: x.title, icon: x.icon, kind: "session", who, href: `/sections/${x.sectionId}`, ...(c ? { status: c.status, note: c.note } : {}) });
    }
  }
  for (const a of s.automations) put({ day: a.day, time: a.time, title: a.name, icon: a.icon, kind: "automation", who: [a.who], href: `/brain/${a.id}` });
  for (const h of s.holidays) put({ day: h.day, time: null, title: h.title, icon: "🕯️", kind: "holiday", who: [] });
  for (const g of s.google) put({ day: g.day, time: g.time, title: g.title, icon: "📅", kind: "google", who: [g.who] });

  for (const list of out.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title));
  return out;
}

/** The earliest of these that falls on `day` in the home's timezone ("tomorrow's first thing" on Today). */
export function firstOn<T extends { at: string }>(day: string, timeZone: string, entries: T[]): T | undefined {
  return entries.filter((x) => todayKey(timeZone, new Date(x.at)) === day).sort((a, b) => a.at.localeCompare(b.at))[0];
}
