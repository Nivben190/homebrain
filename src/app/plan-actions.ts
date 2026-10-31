"use server";
import { revalidatePath } from "next/cache";
import { requireHome } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { reschedulePlan } from "@/lib/engine/execute";
import { isQuiet } from "@/lib/engine/daily";
import { addDays, diffDays, todayKey } from "@/lib/engine/habits";
import { LOG_DAYS_BACK, logSchema, moveSession, moveTargets, normalizePlan, planProps, planSchema, readLog, readPlan, sessionOn, type PlanCheckin } from "@/lib/plan";
import { sendPush } from "@/lib/push";
import { fill, getDict } from "@/i18n";
import type { CheckinRow, Item, Profile } from "@/lib/db-types";

type Result<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: string };

/** What a partner can react with. */
const REACTIONS = ["💪", "🔥", "👏", "❤️", "😂"];

/** Creates or edits a plan; its reminders follow the new schedule right away. */
export async function savePlan(input: { id: string | null; sectionId: string; title: string; spec: unknown; ownerId: string | null }): Promise<Result<Item>> {
  const { supabase, user, profile } = await requireHome();
  const parsed = planSchema.safeParse(input.spec);
  const title = input.title.trim().slice(0, 120);
  if (!parsed.success || !title) return { ok: false, error: "invalid" };
  // A test date must still be ahead when the plan is made; weeks and topics follow it.
  if (!input.id && parsed.data.deadline && diffDays(todayKey(profile.timezone), parsed.data.deadline) < 1) return { ok: false, error: "invalid" };
  const spec = normalizePlan(parsed.data);
  let id = input.id;
  if (id) {
    const { data: old } = await supabase.from("items").select("props").eq("id", id).maybeSingle();
    if (!old) return { ok: false, error: "not_found" };
    const { error } = await supabase.from("items").update({ title, props: planProps(old.props ?? {}, spec), assignee_id: input.ownerId, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: last } = await supabase.from("items").select("position").eq("section_id", input.sectionId).order("position", { ascending: false }).limit(1).maybeSingle();
    const { data: row, error } = await supabase
      .from("items")
      .insert({ section_id: input.sectionId, title, props: planProps({}, spec), assignee_id: input.ownerId ?? user.id, position: (last?.position ?? 0) + 1 })
      .select("id")
      .single();
    if (error || !row) return { ok: false, error: error?.message ?? "denied" };
    id = row.id as string;
  }
  await reschedulePlan(supabase, id, spec, profile.timezone);
  const { data: item } = await supabase.from("items").select("*").eq("id", id).single<Item>();
  revalidatePath("/");
  return item ? { ok: true, data: item } : { ok: false, error: "not_found" };
}

async function planOf(supabase: Awaited<ReturnType<typeof requireHome>>["supabase"], itemId: string) {
  const { data } = await supabase.from("items").select("props").eq("id", itemId).maybeSingle();
  return data ? { props: (data.props ?? {}) as Record<string, unknown>, spec: readPlan(data.props ?? {}) } : null;
}

/**
 * Logs a session (what was done, how long, how it felt) or a skip, for today or
 * up to two days back. The engine tells the partner on its next tick.
 */
export async function logPlanSession(input: { itemId: string; day: string; status: "done" | "skipped"; log?: unknown; note?: string | null }): Promise<Result<CheckinRow>> {
  const { supabase, profile } = await requireHome();
  const plan = await planOf(supabase, input.itemId);
  if (!plan?.spec) return { ok: false, error: "not_found" };
  const today = todayKey(profile.timezone);
  const back = diffDays(input.day, today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || back < 0 || back > LOG_DAYS_BACK) return { ok: false, error: "invalid" };
  const log = input.log === undefined ? null : logSchema.safeParse(input.log);
  if (log && !log.success) return { ok: false, error: "invalid" };
  // Only this plan's topics count.
  if (log?.data) {
    const ids = new Set(plan.spec.topics.map((x) => x.id));
    log.data.topics = log.data.topics.filter((id) => ids.has(id));
    log.data.revised = log.data.revised.filter((id) => ids.has(id));
  }
  const { data: row, error } = await supabase
    .from("checkins")
    .upsert({ item_id: input.itemId, day: input.day, status: input.status, data: log?.data ?? null, note: input.note?.trim().slice(0, 500) || null }, { onConflict: "item_id,day" })
    .select("*")
    .single<CheckinRow>();
  if (error || !row) return { ok: false, error: error?.message ?? "denied" };
  await reschedulePlan(supabase, input.itemId, plan.spec, profile.timezone);
  revalidatePath("/");
  return { ok: true, data: row };
}

export async function removePlanSession(itemId: string, day: string): Promise<Result> {
  const { supabase, profile } = await requireHome();
  const plan = await planOf(supabase, itemId);
  if (!plan?.spec) return { ok: false, error: "not_found" };
  const { error } = await supabase.from("checkins").delete().eq("item_id", itemId).eq("day", day);
  if (error) return { ok: false, error: error.message };
  await reschedulePlan(supabase, itemId, plan.spec, profile.timezone);
  revalidatePath("/");
  return { ok: true };
}

/** Moves a planned session to a free day later in the same week; reminders follow. */
export async function movePlanSession(itemId: string, from: string, to: string): Promise<Result<Item>> {
  const { supabase, profile } = await requireHome();
  const plan = await planOf(supabase, itemId);
  if (!plan?.spec) return { ok: false, error: "not_found" };
  const { data: rows } = await supabase.from("checkins").select("day,status").eq("item_id", itemId).gte("day", addDays(from, -7));
  const today = todayKey(profile.timezone);
  const next = moveTargets(plan.spec, (rows ?? []) as PlanCheckin[], from, today).includes(to) ? moveSession(plan.spec, from, to) : null;
  if (!next) return { ok: false, error: "invalid" };
  const { data: item, error } = await supabase.from("items").update({ props: planProps(plan.props, next), updated_at: new Date().toISOString() }).eq("id", itemId).select("*").single<Item>();
  if (error || !item) return { ok: false, error: error?.message ?? "denied" };
  await reschedulePlan(supabase, itemId, next, profile.timezone);
  const { data: fresh } = await supabase.from("items").select("*").eq("id", itemId).single<Item>();
  revalidatePath("/");
  return { ok: true, data: fresh ?? item };
}

/** A reaction to someone's session (the same one again takes it back); they get a push. */
export async function reactToSession(checkinId: string, emoji: string): Promise<Result<Record<string, string>>> {
  const { supabase, user, profile } = await requireHome();
  if (emoji && !REACTIONS.includes(emoji)) return { ok: false, error: "invalid" };
  const { error } = await supabase.rpc("react_to_checkin", { p_id: checkinId, p_emoji: emoji });
  if (error) return { ok: false, error: error.message };
  const { data: row } = await supabase
    .from("checkins")
    .select("user_id,day,data,reactions,items(title,props,sections(id,icon))")
    .eq("id", checkinId)
    .single<{ user_id: string | null; day: string; data: unknown; reactions: Record<string, string>; items: { title: string; props: Record<string, unknown>; sections: { id: string; icon: string } } }>();
  if (!row) return { ok: false, error: "not_found" };
  if (emoji && row.user_id && row.user_id !== user.id) {
    const admin = createSupabaseAdmin();
    const { data: target } = await admin.from("profiles").select("*").eq("user_id", row.user_id).single<Profile>();
    if (target && !(await isQuiet(target))) {
      const t = getDict(target.locale).plan;
      const spec = readPlan(row.items.props ?? {});
      const sessionId = readLog(row.data)?.session;
      const session = spec ? (spec.sessions.find((s) => s.id === sessionId) ?? sessionOn(spec, row.day)) : null;
      const day = new Intl.DateTimeFormat(target.locale, { weekday: "long", timeZone: "UTC" }).format(new Date(`${row.day}T12:00:00Z`));
      await sendPush(admin, target.user_id, {
        title: `${row.items.sections.icon} ${fill(t.reactTitle, { name: profile.display_name, emoji })}`,
        body: fill(t.reactBody, { session: spec && spec.sessions.length > 1 && session ? session.name : row.items.title, day }),
        url: `/sections/${row.items.sections.id}`,
      });
    }
  }
  return { ok: true, data: row.reactions ?? {} };
}
