// Family calendar (roadmap 3.4): everything dated in one week, by day.
import { addDays, assigneesFor, dueDaysBetween, type Habit } from "@/lib/engine/habits";

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
}

export interface AgendaSources {
  /** Items with a due date, already in local day + time. */
  items: { id: string; title: string; icon: string; sectionId: string; day: string; time: string | null; who: string | null }[];
  sessions: { id: string; title: string; icon: string; sectionId: string; habit: Habit; fallback: string | null }[];
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
    for (const day of dueDaysBetween(x.habit, from, to)) {
      put({ day, time: x.habit.time, title: x.title, icon: x.icon, kind: "session", who: assigneesFor(x.habit, day, s.members, x.fallback), href: `/sections/${x.sectionId}` });
    }
  }
  for (const a of s.automations) put({ day: a.day, time: a.time, title: a.name, icon: a.icon, kind: "automation", who: [a.who], href: `/brain/${a.id}` });
  for (const h of s.holidays) put({ day: h.day, time: null, title: h.title, icon: "🕯️", kind: "holiday", who: [] });
  for (const g of s.google) put({ day: g.day, time: g.time, title: g.title, icon: "📅", kind: "google", who: [g.who] });

  for (const list of out.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title));
  return out;
}
