import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckinRow, Item, Profile, RequestRow, Section } from "@/lib/db-types";
import { assigneesFor, isDue, readHabit, todayKey, addDays, type Habit } from "@/lib/engine/habits";
import { zonedTimeToUtc } from "@/lib/engine/time";
import { DEFAULT_PLACE, getForecast, outdoorWarning, walkAdvice, weatherAt, type DayWeather, type Forecast, type WalkAdvice } from "@/lib/weather";
import { getJewishCalendar, holyStatus, type HolyStatus } from "@/lib/jewish";
import { getDict } from "@/i18n";

export interface DaySession {
  item: Item;
  section: Section;
  habit: Habit;
  /** Today's check-in by anyone (shared routines count once). */
  done: CheckinRow | null;
  assignees: string[];
  mine: boolean;
  /** Rain/heat line for outdoor sessions. */
  warning: string | null;
}

export interface DayModel {
  today: string;
  sessions: DaySession[];
  due: Item[];
  requests: RequestRow[];
  forecast: Forecast | null;
  weather: DayWeather | null;
  advice: WalkAdvice | null;
  holy: HolyStatus;
}

/** Local day bounds as UTC ISO strings. */
function dayBounds(day: string, timeZone: string) {
  const [y, m, d] = [+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10)];
  const start = zonedTimeToUtc(y, m, d, 0, 0, timeZone);
  const next = addDays(day, 1);
  const end = zonedTimeToUtc(+next.slice(0, 4), +next.slice(5, 7), +next.slice(8, 10), 0, 0, timeZone);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Everything on one person's plate today. Works with the user's client (RLS)
 * or the engine's admin client (visibility is re-checked here).
 */
export async function buildDay(db: SupabaseClient, me: Profile, memberIds: string[], now = new Date()): Promise<DayModel> {
  const tz = me.timezone;
  const today = todayKey(tz, now);
  const lat = me.lat ?? DEFAULT_PLACE.lat;
  const lon = me.lon ?? DEFAULT_PLACE.lon;
  const { start, end } = dayBounds(today, tz);
  const visible = (s: Pick<Section, "owner_id">) => !s.owner_id || s.owner_id === me.user_id;

  const [trackerQ, dueQ, reqQ, forecast, holyItems] = await Promise.all([
    db
      .from("items")
      .select("*, checkins(*), sections!inner(*)")
      .eq("sections.household_id", me.household_id)
      .eq("sections.view", "tracker")
      .eq("done", false)
      .eq("checkins.day", today)
      .returns<(Item & { checkins: CheckinRow[]; sections: Section })[]>(),
    db
      .from("items")
      .select("*, sections!inner(owner_id,household_id,view)")
      .eq("sections.household_id", me.household_id)
      .neq("sections.view", "gallery")
      .gte("due_at", start)
      .lt("due_at", end)
      .returns<(Item & { sections: Pick<Section, "owner_id"> })[]>(),
    db.from("requests").select("*").eq("household_id", me.household_id).eq("to_user", me.user_id).gte("updated_at", addDays(today, -7)).returns<RequestRow[]>(),
    getForecast(lat, lon, tz),
    getJewishCalendar(lat, lon, tz, addDays(today, -2), addDays(today, 21)),
  ]);

  const t = getDict(me.locale);
  const weather = forecast?.days.find((d) => d.day === today) ?? null;
  const hours = forecast?.hours ?? [];

  const sessions: DaySession[] = [];
  for (const row of trackerQ.data ?? []) {
    const { checkins, sections: section, ...item } = row;
    const habit = readHabit(item.props);
    if (!habit || !visible(section) || !isDue(habit, today)) continue;
    const assignees = assigneesFor(habit, today, memberIds, item.assignee_id ?? section.owner_id ?? item.created_by);
    sessions.push({
      item: item as Item,
      section,
      habit,
      done: checkins?.[0] ?? null,
      assignees,
      mine: assignees.length === 0 || assignees.includes(me.user_id),
      warning: habit.outdoor ? outdoorWarning(weatherAt(hours, today, habit.time), { rain: t.daily.rainAt, hot: t.daily.hotAt }) : null,
    });
  }
  sessions.sort((a, b) => a.habit.time.localeCompare(b.habit.time));

  return {
    today,
    sessions,
    due: (dueQ.data ?? []).filter((i) => visible(i.sections)),
    requests: (reqQ.data ?? []).filter((r) => r.status !== "declined" && (r.status !== "done" || r.updated_at.slice(0, 10) >= today)),
    forecast,
    weather,
    advice: forecast ? walkAdvice(hours, today) : null,
    holy: holyStatus(holyItems, now),
  };
}

/** What's still open for me today (sessions, due items, requests). */
export function openTitles(day: DayModel): string[] {
  return [
    ...day.sessions.filter((s) => s.mine && !s.done).map((s) => s.item.title),
    ...day.due.filter((i) => !i.done).map((i) => i.title),
    ...day.requests.filter((r) => r.status === "open" || r.status === "doing").map((r) => r.text),
  ];
}

/** Done / total for the wrap-up. */
export function dayScore(day: DayModel) {
  const mine = day.sessions.filter((s) => s.mine);
  const reqs = day.requests;
  const total = mine.length + day.due.length + reqs.length;
  const done = mine.filter((s) => s.done).length + day.due.filter((i) => i.done).length + reqs.filter((r) => r.status === "done").length;
  return { done, total, left: total - done };
}
