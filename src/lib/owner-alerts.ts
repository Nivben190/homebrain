import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { todayKey } from "@/lib/engine/habits";
import { zonedParts } from "@/lib/engine/time";
import { silenceAlert, tickAlert, weeklyReport, weekStats, type EngineState, type Mail } from "@/lib/owner-report";

const OWNER_TZ = "Asia/Jerusalem";
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

/** Sends to the owner; false when there's no owner address or the send failed. */
async function tellOwner(mail: Mail) {
  const to = process.env.SIGNUP_ALERT_EMAIL;
  if (!to) return false;
  return (await sendEmail(to, mail.subject, mail.body)).ok;
}

const readState = async (db: SupabaseClient) =>
  (await db.from("engine_status").select("last_tick_at,failed_phases,last_error,alerted_at,weekly_report_on").eq("id", true).maybeSingle<EngineState & { weekly_report_on: string | null }>()).data;

/** Called by the tick before it writes its heartbeat: the status the last tick left. */
export const engineStateBefore = readState;

/** After a tick: email the owner about failed phases, or about a gap the engine just came back from. */
export async function alertAfterTick(db: SupabaseClient, prev: EngineState | null, failed: { phase: string; error?: string }[], now: Date) {
  const mail = tickAlert(prev, failed, now, appUrl());
  if (mail && (await tellOwner(mail))) await db.from("engine_status").update({ alerted_at: now.toISOString() }).eq("id", true);
}

/**
 * The half-hourly owner checks, from the Gmail cron (a different pg_cron job, so it
 * still runs when ticks don't): a silent engine, and the Sunday-morning report.
 */
export async function ownerChecks(db: SupabaseClient, now = new Date()) {
  const state = await readState(db);
  const silent = silenceAlert(state, now, appUrl());
  if (silent && (await tellOwner(silent))) await db.from("engine_status").update({ alerted_at: now.toISOString() }).eq("id", true);

  const { weekday, hour } = zonedParts(now, OWNER_TZ);
  const today = todayKey(OWNER_TZ, now);
  if (!state || weekday !== 0 || hour < 9 || state.weekly_report_on === today) return { silent: !!silent, weekly: false };
  // Claim the week first, so two overlapping crons send one report.
  const { data: claimed } = await db.from("engine_status").update({ weekly_report_on: today }).eq("id", true).or(`weekly_report_on.is.null,weekly_report_on.neq.${today}`).select("id");
  if (!claimed?.length) return { silent: !!silent, weekly: false };
  await tellOwner(weeklyReport(await collectWeek(db, now), appUrl()));
  return { silent: !!silent, weekly: true };
}

async function collectWeek(db: SupabaseClient, now: Date) {
  const since = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const [homes, members, checkins, activity, finder] = await Promise.all([
    db.from("households").select("id,created_at"),
    db.from("profiles").select("user_id,household_id"),
    db.from("checkins").select("user_id,created_at").eq("status", "done").gte("created_at", since),
    db.from("activity").select("household_id,actor,at").in("kind", ["ticked", "checked_in"]).gte("at", since),
    db.from("events").select("payload").eq("type", "finder").gte("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString()),
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

/** Me → Send feedback. */
export function feedbackMail(input: { text: string; email: string | null; name: string; locale: string; at: Date }): Mail {
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: OWNER_TZ }).format(input.at);
  return {
    subject: `Home Brain feedback from ${input.name}`,
    body: [input.text, "", `— ${input.name}${input.email ? ` <${input.email}>` : ""}, ${when} (Israel time), app in ${input.locale}`].join("\n"),
  };
}

export const sendFeedbackToOwner = (mail: Mail) => tellOwner(mail);
