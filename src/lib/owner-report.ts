// Emails to the app's owner (SIGNUP_ALERT_EMAIL): the engine stopping or
// failing, and a weekly "are they staying" report. Pure wording and counting;
// owner-alerts.ts reads the database and sends.

import { MAX_TICK_AGE_SECONDS } from "@/lib/health";

/** At most one engine email an hour, however long a problem lasts. */
export const ALERT_EVERY_MS = 60 * 60 * 1000;
/** Silent this long and the engine counts as down. */
export const SILENT_MS = 5 * 60 * 1000;

export interface EngineState {
  last_tick_at: string;
  failed_phases: string[];
  last_error?: string | null;
  alerted_at?: string | null;
}

export type Mail = { subject: string; body: string };

const israel = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(d);
const quiet = (state: EngineState | null, now: Date) => !!state?.alerted_at && now.getTime() - Date.parse(state.alerted_at) < ALERT_EVERY_MS;

/**
 * Seen from a tick that just ran: phases that failed, or a gap since the tick
 * before (the engine was down and is back). `prev` is the status before this tick.
 */
export function tickAlert(prev: EngineState | null, failed: { phase: string; error?: string }[], now: Date, appUrl = ""): Mail | null {
  if (quiet(prev, now)) return null;
  const gapMs = prev ? now.getTime() - Date.parse(prev.last_tick_at) : 0;
  if (!failed.length && gapMs <= SILENT_MS) return null;
  const lines = [
    ...(gapMs > SILENT_MS ? [`The engine was silent for ${Math.round(gapMs / 60000)} minutes (last run ${israel(new Date(prev!.last_tick_at))}). It's running again now; reminders due in that gap more than 30 minutes ago were skipped.`, ""] : []),
    ...(failed.length ? ["These steps failed in the run at " + israel(now) + ":", ...failed.map((f) => `- ${f.phase}: ${f.error ?? "unknown error"}`), "", "Each step is tried again next minute."] : []),
    "",
    "Vercel logs: https://vercel.com/nivben190s-projects/homebrain/logs",
    ...(appUrl ? [`Health: ${appUrl}/api/health`] : []),
  ];
  const subject = failed.length ? `Home Brain: ${failed.map((f) => f.phase).join(", ")} failed` : "Home Brain: the engine was down and is back";
  return { subject, body: lines.join("\n") };
}

/** Seen from outside the tick (the half-hourly cron): no tick for a while means nothing is running. */
export function silenceAlert(state: EngineState | null, now: Date, appUrl = ""): Mail | null {
  if (quiet(state, now)) return null;
  const ageMs = state ? now.getTime() - Date.parse(state.last_tick_at) : Infinity;
  if (ageMs <= Math.max(SILENT_MS, MAX_TICK_AGE_SECONDS * 1000)) return null;
  const since = state ? `since ${israel(new Date(state.last_tick_at))} (${Math.round(ageMs / 60000)} minutes)` : "ever";
  return {
    subject: "Home Brain: the engine isn't running",
    body: [
      `No engine run ${since}. Reminders and automations aren't going out.`,
      "",
      "Check the home-brain-tick cron in Supabase (cron.job_run_details) and the Vercel logs for /api/engine/tick.",
      "Vercel logs: https://vercel.com/nivben190s-projects/homebrain/logs",
      ...(appUrl ? [`Health: ${appUrl}/api/health`] : []),
    ].join("\n"),
  };
}

export interface WeekInput {
  now: Date;
  homes: { id: string; created_at: string }[];
  /** Who lives where. */
  members: { user_id: string; household_id: string | null }[];
  /** Ticks and check-ins, shared or private, from a little over a week back. */
  ticks: { user_id: string | null; household_id?: string | null; at: string }[];
  /** "Help me choose" goals picked this week, one list per use. */
  finder: string[][];
}

export interface WeekStats {
  homes: number;
  newHomes: number;
  newHomesTicked: number;
  activeHomes: number;
  goals: [goal: string, times: number][];
}

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

export function weekStats({ now, homes, members, ticks, finder }: WeekInput): WeekStats {
  const weekAgo = now.getTime() - WEEK_MS;
  const homeOf = new Map(members.map((m) => [m.user_id, m.household_id]));
  const ticksBy = new Map<string, number[]>();
  for (const t of ticks) {
    const home = t.household_id ?? (t.user_id ? homeOf.get(t.user_id) : null);
    if (!home) continue;
    ticksBy.set(home, [...(ticksBy.get(home) ?? []), Date.parse(t.at)]);
  }
  const fresh = homes.filter((h) => Date.parse(h.created_at) >= weekAgo);
  const goals = new Map<string, number>();
  for (const pick of finder) for (const g of pick) goals.set(g, (goals.get(g) ?? 0) + 1);
  return {
    homes: homes.length,
    newHomes: fresh.length,
    newHomesTicked: fresh.filter((h) => (ticksBy.get(h.id) ?? []).some((at) => at - Date.parse(h.created_at) <= DAY_MS)).length,
    activeHomes: homes.filter((h) => (ticksBy.get(h.id) ?? []).some((at) => at >= weekAgo)).length,
    goals: [...goals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

export function weeklyReport(s: WeekStats, appUrl = ""): Mail {
  return {
    subject: `Home Brain this week: ${s.newHomes} new, ${s.activeHomes} of ${s.homes} homes active`,
    body: [
      `New homes: ${s.newHomes}`,
      `  …ticked something in their first day: ${s.newHomesTicked} of ${s.newHomes}`,
      `Homes active this week: ${s.activeHomes} of ${s.homes}`,
      "",
      s.goals.length ? `"Help me choose" goals picked: ${s.goals.map(([g, n]) => `${g} ×${n}`).join(", ")}` : `Nobody used "Help me choose" this week.`,
      ...(appUrl ? ["", appUrl] : []),
    ].join("\n"),
  };
}
