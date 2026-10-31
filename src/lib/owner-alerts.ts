import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { todayKey } from "@/lib/engine/habits";
import { zonedParts } from "@/lib/engine/time";
import { DAY_MS, OWNER_TZ, silenceAlert, tickAlert, WEEK_MS, weeklyReport, weekStats, type EngineState, type Mail } from "@/lib/owner-report";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

/** Sends to the owner; false when there's no owner address or the send failed. */
export async function tellOwner(mail: Mail) {
  const to = process.env.SIGNUP_ALERT_EMAIL;
  if (!to) return false;
  return (await sendEmail(to, mail.subject, mail.body)).ok;
}

/** What the last tick left: the tick reads it before writing its own heartbeat. */
export const engineState = async (db: SupabaseClient) =>
  (await db.from("engine_status").select("last_tick_at,failed_phases,last_error,alerted_at,weekly_report_on").eq("id", true).maybeSingle<EngineState & { weekly_report_on: string | null }>()).data;

/** After a tick: email the owner about failed phases, or about a gap the engine just came back from. */
export async function alertAfterTick(db: SupabaseClient, prev: EngineState | null, failed: { phase: string; error?: string }[], now: Date) {
  await alertOnce(db, tickAlert(prev, failed, now, appUrl()), now);
}

/** Sends an engine email and remembers when, for the one-an-hour limit. */
async function alertOnce(db: SupabaseClient, mail: Mail | null, now: Date) {
  if (mail && (await tellOwner(mail))) await db.from("engine_status").update({ alerted_at: now.toISOString() }).eq("id", true);
  return !!mail;
}

/**
 * The half-hourly owner checks, from the Gmail cron (a different pg_cron job, so it
 * still runs when ticks don't): a silent engine, and the Sunday-morning report.
 */
export async function ownerChecks(db: SupabaseClient, now = new Date()) {
  const state = await engineState(db);
  const silent = await alertOnce(db, silenceAlert(state, now, appUrl()), now);

  const { weekday, hour } = zonedParts(now, OWNER_TZ);
  const today = todayKey(OWNER_TZ, now);
  const notYet = { silent, weekly: false };
  if (!state || weekday !== 0 || hour < 9 || state.weekly_report_on === today) return notYet;
  // Claim the week first, so two overlapping crons send one report.
  const { data: claimed } = await db.from("engine_status").update({ weekly_report_on: today }).eq("id", true).or(`weekly_report_on.is.null,weekly_report_on.neq.${today}`).select("id");
  if (!claimed?.length) return notYet;
  if (!(await tellOwner(weeklyReport(await collectWeek(db, now), appUrl())))) {
    // Not sent: the next half-hourly run tries again.
    await db.from("engine_status").update({ weekly_report_on: state.weekly_report_on }).eq("id", true);
    return notYet;
  }
  return { silent, weekly: true };
}

async function collectWeek(db: SupabaseClient, now: Date) {
  // A day more than the week, so a home made a week ago still has its first day.
  const since = new Date(now.getTime() - WEEK_MS - DAY_MS).toISOString();
  const [homes, members, checkins, activity, finder] = await Promise.all([
    db.from("households").select("id,created_at"),
    db.from("profiles").select("user_id,household_id"),
    db.from("checkins").select("user_id,created_at").eq("status", "done").gte("created_at", since),
    db.from("activity").select("household_id,actor,at").in("kind", ["ticked", "checked_in"]).gte("at", since),
    db.from("events").select("payload").eq("type", "finder").gte("created_at", new Date(now.getTime() - WEEK_MS).toISOString()),
  ]);
  return weekStats({
    now,
    homes: homes.data ?? [],
    members: members.data ?? [],
    ticks: [
      ...(checkins.data ?? []).map((c) => ({ user_id: c.user_id, at: c.created_at })),
      ...(activity.data ?? []).map((a) => ({ user_id: a.actor, household_id: a.household_id, at: a.at })),
    ],
    finder: (finder.data ?? []).map((e) => (Array.isArray(e.payload?.goals) ? (e.payload.goals as string[]) : [])),
  });
}
