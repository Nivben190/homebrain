"use server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSession, requireHome } from "@/lib/session";
import { seedStarterBrain } from "@/lib/starter";
import { fireAutomation, handledDays, handleEvent, rescheduleDate } from "@/lib/engine/execute";
import { currentOccurrence, readDate } from "@/lib/engine/dates";
import type { RenderedAction } from "@/lib/engine/types";
import { nextRunAt } from "@/lib/engine/schedule";
import { allowedSections, sectionRefs } from "@/lib/engine/scope";
import { canSignUp, inviteState, isInviteToken } from "@/lib/signup";
import { deletionPlan } from "@/lib/account-data";
import { calendarAccess, deleteEvent, upsertEvent } from "@/lib/gcal";
import { automationDefSchema } from "@/lib/engine/types";
import { addDays, todayKey } from "@/lib/engine/habits";
import { getDict, fill } from "@/i18n";
import { dueFromProps, type PropertyDef } from "@/lib/registry/properties";
import { sendPush } from "@/lib/push";
import { openToken, revokeToken } from "@/lib/subs/gmail";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n";
import type { Automation, RequestRow } from "@/lib/db-types";
import { allow, clientIp } from "@/lib/rate-limit";
import { zonedTimeToUtc } from "@/lib/engine/time";
import { newCommit } from "@/lib/commit";
import { HOOK_PURPOSES, hashKey, newKey, type HookPurpose } from "@/lib/hook-keys";

type Result<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const accountInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Creates a confirmed email+password user without sending any email (the
 * default Supabase emails only carry links, which open in Safari instead of the
 * installed app). The client signs in with the password right after.
 * Invite only: the email must be in ALLOWED_EMAILS or come with a household's
 * invite code. Before any home exists, the first account is let through.
 */
export async function createAccount(input: { email: string; password: string; inviteCode?: string }): Promise<Result> {
  const parsed = accountInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;

  const admin = createSupabaseAdmin();
  // Counted per IP before any lookup, so invite codes can't be guessed in bulk.
  if (!(await allow(admin, "signUp", clientIp(await headers())))) return { ok: false, error: "too_many" };
  const code = input.inviteCode?.trim().toUpperCase() ?? "";
  const [{ data: invited }, { count }] = await Promise.all([
    isInviteToken(input.inviteCode?.trim() ?? "")
      ? admin.from("household_invites").select("used_at,expires_at").eq("token", input.inviteCode!.trim()).maybeSingle().then(({ data }) => ({ data: inviteState(data) === "ok" ? data : null }))
      : code
        ? admin.from("households").select("id").eq("invite_code", code).maybeSingle()
        : Promise.resolve({ data: null }),
    admin.from("households").select("id", { count: "exact", head: true }),
  ]);
  const ok = canSignUp({ email, allowedEmails: process.env.ALLOWED_EMAILS, inviteValid: !!invited, anyHome: (count ?? 0) > 0 });
  if (!ok) return { ok: false, error: "not_invited" };

  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return { ok: false, error: exists ? "exists" : error.message };
  }
  return { ok: true };
}

/**
 * Me → Delete my account. Revokes Google, removes the files that go with the
 * account, deletes the home if nobody else lives there, then the user; their
 * private spaces, keys, devices and runs cascade with it. Shared items they
 * made stay for the partner. The typed email guards against a stray tap.
 */
export async function deleteAccount(confirmEmail: string): Promise<Result> {
  const { supabase, user, household } = await requireHome();
  if (!user.email || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return { ok: false, error: "confirm" };

  const db = createSupabaseAdmin();
  const [{ count: others }, { data: sections }, { data: gmail }, { data: gcal }] = await Promise.all([
    db.from("profiles").select("user_id", { count: "exact", head: true }).eq("household_id", household.id).neq("user_id", user.id),
    db.from("sections").select("id,owner_id").eq("household_id", household.id),
    db.from("gmail_connections").select("refresh_token").eq("user_id", user.id),
    db.from("calendar_connections").select("refresh_token").eq("user_id", user.id),
  ]);
  const { data: items } = await db.from("items").select("section_id,props").in("section_id", (sections ?? []).map((s) => s.id));
  const plan = deletionPlan({ userId: user.id, otherMembers: others ?? 0, sections: sections ?? [], items: items ?? [] });

  // Google first: once the rows are gone the tokens can't be revoked.
  await Promise.all(
    [...(gmail ?? []), ...(gcal ?? [])].map(async (c) => {
      try {
        await revokeToken(openToken(c.refresh_token));
      } catch {
        // Unreadable token: deleting it is enough.
      }
    }),
  );
  for (let i = 0; i < plan.files.length; i += 100) await db.storage.from("attachments").remove(plan.files.slice(i, i + 100));
  if (plan.deleteHome) await db.from("households").delete().eq("id", household.id);
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: error.message };
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}

/** Quick-add (roadmap 2.3): one item into any space, with an optional day, time and person. */
export async function quickAdd(input: { sectionId: string; title: string; day: string | null; time: string | null; assigneeId: string | null }): Promise<Result> {
  const { supabase, user, profile } = await requireHome();
  const title = input.title.trim().slice(0, 300);
  if (!title) return { ok: false, error: "empty" };
  const { data: section } = await supabase.from("sections").select("id,view,schema").eq("id", input.sectionId).single<{ id: string; view: string; schema: PropertyDef[] }>();
  if (!section) return { ok: false, error: "no space" };

  const row: Record<string, unknown> = { section_id: section.id, created_by: user.id, position: Date.now() / 1000, title, assignee_id: input.assigneeId };
  if (section.view === "commit") Object.assign(row, newCommit(title, new Date(), profile.timezone));
  if (input.day) {
    const [y, m, d] = input.day.split("-").map(Number);
    const [hh, mm] = (input.time ?? "09:00").split(":").map(Number);
    row.due_at = zonedTimeToUtc(y, m, d, hh, mm, profile.timezone).toISOString();
    const dateProp = section.schema.find((p) => p.type === "date");
    if (dateProp) row.props = { ...((row.props as object) ?? {}), [dateProp.id]: input.time ? `${input.day}T${input.time}` : input.day };
  }
  const { error } = await supabase.from("items").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** A single-use /join link for the caller's home, valid for 7 days (roadmap 2.1). */
export async function createInviteLink(): Promise<Result<{ token: string; expires_at: string }>> {
  const { supabase } = await requireHome();
  const { data, error } = await supabase.rpc("create_invite").single<{ token: string; expires_at: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? "failed" };
  return { ok: true, data: { token: data.token, expires_at: data.expires_at } };
}

/** "Move to this home" for someone who already has one. */
export async function acceptInvite(token: string, bring: boolean): Promise<Result> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.rpc("accept_invite", { p_token: token, p_bring: bring });
  if (error) return { ok: false, error: /expired/.test(error.message) ? "expired" : error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

const profileInput = z.object({
  displayName: z.string().trim().min(1).max(40),
  emoji: z.string().min(1).max(8),
  phone: z.string().trim().max(30).optional().default(""),
  timezone: z.string().default("Asia/Jerusalem"),
});

export async function setupHome(input: {
  mode: "create" | "join";
  homeName?: string;
  inviteCode?: string;
  starter: boolean;
  displayName: string;
  emoji: string;
  phone?: string;
  timezone?: string;
}): Promise<Result> {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return { ok: false, error: "Not signed in" };
  const p = profileInput.parse(input);

  await supabase
    .from("profiles")
    .update({ display_name: p.displayName, emoji: p.emoji, phone: p.phone || null, timezone: p.timezone })
    .eq("user_id", user.id);

  const invite = input.inviteCode?.trim() ?? "";
  const rpc =
    input.mode === "create"
      ? await supabase.rpc("create_household", { p_name: input.homeName?.trim() || "Home" })
      : isInviteToken(invite)
        ? await supabase.rpc("accept_invite", { p_token: invite })
        : await supabase.rpc("join_household", { p_code: invite });
  if (rpc.error) return { ok: false, error: rpc.error.message };

  if (input.starter) {
    await seedStarterBrain(supabase, {
      userId: user.id,
      householdId: rpc.data.id,
      locale: profile.locale,
      timezone: p.timezone,
      shared: input.mode === "create",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
  const { supabase, user } = await getSession();
  if (user) await supabase.from("profiles").update({ locale }).eq("user_id", user.id);
  revalidatePath("/", "layout");
}

const settingsInput = z.object({
  display_name: z.string().trim().min(1).max(40).optional(),
  emoji: z.string().min(1).max(8).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  timezone: z.string().optional(),
  wake_mode: z.enum(["shortcut", "fixed", "first_open"]).optional(),
  wake_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
  place: z.string().trim().max(60).nullable().optional(),
  briefing: z.boolean().optional(),
  wrapup: z.boolean().optional(),
  wrapup_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_shabbat: z.boolean().optional(),
  shabbat_shop: z.boolean().optional(),
});

export async function updateProfile(patch: z.input<typeof settingsInput>): Promise<Result> {
  const { supabase, user } = await requireHome();
  const parsed = settingsInput.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await supabase.from("profiles").update(parsed.data).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOut() {
  const { supabase } = await getSession();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

/** Saves the spaces' order as dragged on the Spaces screen (shared by both phones). */
export async function reorderSections(ids: string[]): Promise<Result> {
  const { supabase } = await requireHome();
  const parsed = z.array(z.string().uuid()).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid order" };
  const results = await Promise.all(parsed.data.map((id, position) => supabase.from("sections").update({ position }).eq("id", id)));
  const failed = results.find((r) => r.error);
  revalidatePath("/sections");
  return failed ? { ok: false, error: failed.error!.message } : { ok: true };
}

export async function saveAutomation(id: string | null, raw: unknown, targetUserId: string): Promise<Result & { id?: string }> {
  const { supabase, user, profile, household, members } = await requireHome();
  const parsed = automationDefSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const target = members.find((m) => m.user_id === targetUserId) ?? profile;

  // Only spaces this household can see (RLS hides foreign and partner-private ones).
  const refs = sectionRefs(parsed.data.actions);
  if (refs.length) {
    const { data: visible } = await supabase.from("sections").select("id,household_id,owner_id").in("id", refs);
    const allowed = allowedSections(visible ?? [], { household_id: household.id, owner_id: user.id });
    if (refs.some((r) => !allowed.has(r))) return { ok: false, error: "This automation points at a space outside your home." };
  }

  const row = {
    ...parsed.data,
    household_id: household.id,
    owner_id: user.id,
    target_user_id: target.user_id,
    next_run_at: parsed.data.enabled ? (nextRunAt(parsed.data.trigger, new Date(), target.timezone)?.toISOString() ?? null) : null,
  };
  const q = id ? supabase.from("automations").update(row).eq("id", id) : supabase.from("automations").insert(row);
  const { data, error } = await q.select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/brain");
  return { ok: true, id: data.id };
}

export async function toggleAutomation(id: string, enabled: boolean): Promise<Result> {
  const { supabase, members } = await requireHome();
  const { data: a } = await supabase.from("automations").select("*").eq("id", id).single<Automation>();
  if (!a) return { ok: false, error: "Not found" };
  const tz = members.find((m) => m.user_id === a.target_user_id)?.timezone ?? "Asia/Jerusalem";
  await supabase
    .from("automations")
    .update({ enabled, next_run_at: enabled ? (nextRunAt(a.trigger, new Date(), tz)?.toISOString() ?? null) : null })
    .eq("id", id);
  revalidatePath("/brain");
  return { ok: true };
}

export async function deleteAutomation(id: string) {
  const { supabase } = await requireHome();
  const { data: mine } = await supabase.from("automations").select("id").eq("id", id).maybeSingle();
  if (mine) {
    // Its unanswered cards would otherwise linger in "Waiting for you" (both of us).
    await createSupabaseAdmin().from("runs").update({ acknowledged_at: new Date().toISOString() }).eq("automation_id", id).is("acknowledged_at", null);
    await supabase.from("automations").delete().eq("id", id);
  }
  revalidatePath("/brain");
  revalidatePath("/");
  redirect("/brain");
}

/** Fires an automation immediately (for testing from the editor). */
export async function runAutomationNow(id: string): Promise<Result & { runId?: string }> {
  const { supabase } = await requireHome();
  // RLS proves ownership; the engine then needs service-role access.
  const { data: a } = await supabase.from("automations").select("*").eq("id", id).single<Automation>();
  if (!a) return { ok: false, error: "Not found" };
  const out = await fireAutomation(createSupabaseAdmin(), { ...a, conditions: [] });
  revalidatePath("/");
  return out.status === "fired" ? { ok: true, runId: out.runId } : { ok: false, error: out.reason ?? out.status };
}

// ---------------------------------------------------------------------------
// Runs & events
// ---------------------------------------------------------------------------

export async function markRun(id: string, done: boolean) {
  const { supabase, profile } = await requireHome();
  const now = new Date().toISOString();
  const { data: run } = await supabase
    .from("runs")
    .update(done ? { done_at: now, acknowledged_at: now } : { done_at: null })
    .eq("id", id)
    .select("item_id,automation_id,user_id,rendered")
    .single<{ item_id: string | null; automation_id: string | null; user_id: string; rendered: RenderedAction[] }>();
  // Tracker reminders: "Done" checks the session in for today. Reminder-calendar
  // alerts carry the date they're about ("No more needed" handles that date).
  if (run?.item_id) {
    const doneAction = run.rendered.find((r) => r.kind === "done");
    const dateDay = doneAction?.kind === "done" ? doneAction.day : undefined;
    const day = dateDay ?? todayKey(profile.timezone);
    if (done) await supabase.from("checkins").upsert({ item_id: run.item_id, day, status: "done" }, { onConflict: "item_id,day" });
    else await supabase.from("checkins").delete().eq("item_id", run.item_id).eq("day", day);
    if (dateDay) await afterDateHandled(supabase, run.item_id, profile.timezone);
  } else if (run?.automation_id && done) {
    // Earlier unanswered cards from the same automation are answered too.
    await supabase.from("runs").update({ acknowledged_at: now }).eq("automation_id", run.automation_id).eq("user_id", run.user_id).is("acknowledged_at", null);
  }
  revalidatePath("/");
}

/**
 * After a reminder-calendar date was handled (or un-handled): a one-time date
 * is finished — or reopened — and a repeating one moves to its next date.
 */
async function afterDateHandled(supabase: Awaited<ReturnType<typeof requireHome>>["supabase"], itemId: string, timeZone: string) {
  const { data: item } = await supabase.from("items").select("id,props").eq("id", itemId).single();
  const spec = item ? readDate(item.props ?? {}) : null;
  if (!spec) return;
  const handled = await handledDays(supabase, itemId);
  if (spec.repeat === "once") {
    const isDone = handled.has(spec.date);
    await supabase.from("items").update({ done: isDone, updated_at: new Date().toISOString() }).eq("id", itemId);
    if (isDone) return void (await supabase.from("items").update({ remind_at: null }).eq("id", itemId));
  }
  await rescheduleDate(supabase, itemId, spec, timeZone, handled);
}

/** "No more needed" from the space itself (not from an alert). */
export async function handleDate(itemId: string, handled: boolean) {
  const { supabase, profile } = await requireHome();
  const { data: item } = await supabase.from("items").select("id,props").eq("id", itemId).single();
  const spec = item ? readDate(item.props ?? {}) : null;
  if (!spec) return;
  const today = todayKey(profile.timezone);
  const done = await handledDays(supabase, itemId);
  const occurrence = handled ? currentOccurrence(spec, today, (d) => done.has(d)) : [...done].sort().at(-1);
  if (!occurrence) return;
  const { error } = handled
    ? await supabase.from("checkins").upsert({ item_id: itemId, day: occurrence, status: "done" }, { onConflict: "item_id,day" })
    : await supabase.from("checkins").delete().eq("item_id", itemId).eq("day", occurrence);
  // Thrown so the space screen undoes its optimistic change and offers Retry.
  if (error) throw new Error(error.message);
  await afterDateHandled(supabase, itemId, profile.timezone);
  revalidatePath("/");
}

export async function dismissRun(id: string) {
  const { supabase } = await requireHome();
  await supabase.from("runs").update({ acknowledged_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/");
}

/** In-app events, e.g. the "I'm awake" button or first open of the day. */
export async function emitEvent(type: "wake", source: "button" | "first_open") {
  const { user, profile } = await requireHome();
  const admin = createSupabaseAdmin();
  if (source === "first_open") {
    if (profile.wake_mode !== "first_open") return { fired: 0 };
    const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("type", "wake").gte("created_at", since);
    if (count) return { fired: 0 };
  }
  const outcomes = await handleEvent(admin, user.id, type, { source });
  revalidatePath("/");
  return { fired: outcomes.filter((o) => o.status === "fired").length, queued: outcomes.filter((o) => o.reason?.startsWith("queued")).length };
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

const subInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function savePushSubscription(sub: unknown, deviceLabel: string): Promise<Result> {
  const { supabase, user } = await requireHome();
  const parsed = subInput.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "Invalid subscription" };
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, device_label: deviceLabel.slice(0, 60) },
    { onConflict: "endpoint" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function sendTestPush(): Promise<Result> {
  const { user, profile } = await requireHome();
  const sent = await sendPush(createSupabaseAdmin(), user.id, {
    title: `🧠 ${getDict(profile.locale).settings.testPushTitle}`,
    body: getDict(profile.locale).settings.testPushBody,
    url: "/",
  });
  return sent > 0 ? { ok: true } : { ok: false, error: "No devices registered" };
}

// ---------------------------------------------------------------------------
// Shortcut keys (roadmap 1.3)
// ---------------------------------------------------------------------------

/** Revokes this person's key for one Shortcut and makes a new one, returned once. */
export async function rotateHookKey(purpose: HookPurpose): Promise<Result & { key?: string }> {
  if (!HOOK_PURPOSES.includes(purpose)) return { ok: false, error: "Unknown key" };
  const { user } = await requireHome();
  const admin = createSupabaseAdmin();
  const { error: revokeError } = await admin.from("hook_keys").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).eq("purpose", purpose).is("revoked_at", null);
  if (revokeError) return { ok: false, error: revokeError.message };
  const key = newKey();
  const { error } = await admin.from("hook_keys").insert({ user_id: user.id, purpose, key_hash: hashKey(key) });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me/iphone");
  return { ok: true, key };
}

// ---------------------------------------------------------------------------
// Partner requests ("Can you…?")
// ---------------------------------------------------------------------------

export async function sendRequest(input: { to: string; text: string; due: "today" | "tomorrow" | null }): Promise<Result> {
  const { supabase, user, profile, household, members } = await requireHome();
  const to = members.find((m) => m.user_id === input.to && m.user_id !== user.id);
  const text = input.text.trim().slice(0, 300);
  if (!to || !text) return { ok: false, error: "Invalid request" };
  const today = todayKey(profile.timezone);
  const due_day = input.due === "today" ? today : input.due === "tomorrow" ? addDays(today, 1) : null;
  const { data, error } = await supabase.from("requests").insert({ household_id: household.id, to_user: to.user_id, text, due_day }).select("id").single();
  if (error) return { ok: false, error: error.message };
  const t = getDict(to.locale).ask;
  await sendPush(createSupabaseAdmin(), to.user_id, { title: fill(t.pushTitle, { name: `${profile.emoji} ${profile.display_name}` }), body: text, url: `/?request=${data.id}` });
  revalidatePath("/");
  return { ok: true };
}

export async function setRequestStatus(id: string, status: "doing" | "done" | "declined" | "open"): Promise<Result> {
  const { supabase, profile, members } = await requireHome();
  const { data: req } = await supabase.from("requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("*").single<RequestRow>();
  if (!req) return { ok: false, error: "Not found" };
  // Tell the sender when it's done (or can't be done).
  const sender = members.find((m) => m.user_id === req.from_user);
  if (sender && sender.user_id !== profile.user_id && (status === "done" || status === "declined")) {
    const t = getDict(sender.locale).ask;
    const body = status === "done" ? fill(t.donePush, { name: `${profile.emoji} ${profile.display_name}`, text: req.text }) : `↩ ${profile.display_name}: ${req.text}`;
    await sendPush(createSupabaseAdmin(), sender.user_id, { title: "Home Brain", body, url: "/" });
  }
  revalidatePath("/");
  return { ok: true };
}

export async function deleteRequest(id: string) {
  const { supabase } = await requireHome();
  await supabase.from("requests").delete().eq("id", id);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Wrap-up
// ---------------------------------------------------------------------------

/** Push a dated item's due date (and its first date property) one day later. */
export async function moveItemToTomorrow(itemId: string): Promise<Result> {
  const { supabase, profile } = await requireHome();
  const { data: item } = await supabase.from("items").select("props, due_at, sections(schema)").eq("id", itemId).single();
  if (!item) return { ok: false, error: "Not found" };
  const schema = ((item.sections as unknown as { schema: PropertyDef[] } | null)?.schema ?? []) as PropertyDef[];
  const dateProp = schema.find((p) => p.type === "date");
  const tomorrow = addDays(todayKey(profile.timezone), 1);
  const props = dateProp ? { ...(item.props as Record<string, unknown>), [dateProp.id]: tomorrow } : item.props;
  const due = dateProp ? dueFromProps(schema, props as Record<string, unknown>) : new Date(new Date(item.due_at!).getTime() + 86400000).toISOString();
  await supabase.from("items").update({ props, due_at: due }).eq("id", itemId);
  revalidatePath("/wrapup");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dog
// ---------------------------------------------------------------------------

const petInput = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().min(1).max(8).default("🐶"),
  breed: z.string().trim().max(60).nullable().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  chip: z.string().trim().max(40).nullable().optional(),
  vet_name: z.string().trim().max(60).nullable().optional(),
  vet_phone: z.string().trim().max(30).nullable().optional(),
  food_bag_kg: z.number().positive().max(100).nullable().optional(),
  daily_grams: z.number().positive().max(5000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function savePet(id: string | null, raw: z.input<typeof petInput>): Promise<Result & { id?: string }> {
  const { supabase, household } = await requireHome();
  const parsed = petInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const q = id ? supabase.from("pets").update(parsed.data).eq("id", id) : supabase.from("pets").insert({ ...parsed.data, household_id: household.id });
  const { data, error } = await q.select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true, id: data.id };
}

export async function logPetWeight(petId: string, kg: number): Promise<Result> {
  const { supabase, profile } = await requireHome();
  if (!(kg > 0 && kg < 200)) return { ok: false, error: "Invalid weight" };
  const { error } = await supabase.from("pet_weights").upsert({ pet_id: petId, day: todayKey(profile.timezone), kg }, { onConflict: "pet_id,day" });
  revalidatePath(`/pets/${petId}`);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function newFoodBag(petId: string): Promise<Result> {
  const { supabase, profile } = await requireHome();
  const { error } = await supabase.from("pets").update({ bag_started: todayKey(profile.timezone), food_alerted_bag: null }).eq("id", petId);
  revalidatePath(`/pets/${petId}`);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Adds "Dog food" to the dog supplies list (or groceries), re-opening it if it's in history. */
export async function reorderFood(petId: string): Promise<Result> {
  const { supabase, profile, household } = await requireHome();
  const { data: pet } = await supabase.from("pets").select("name").eq("id", petId).single();
  const { data: lists } = await supabase.from("sections").select("id,template").eq("household_id", household.id).in("template", ["dog-supplies", "groceries"]);
  const list = lists?.find((l) => l.template === "dog-supplies") ?? lists?.[0];
  if (!list) return { ok: false, error: "No shopping list" };
  const t = getDict(profile.locale).pets;
  const title = fill(t.foodItem, { name: pet?.name ?? t.theDog });
  const { data: existing } = await supabase.from("items").select("id").eq("section_id", list.id).ilike("title", `%${t.foodWord}%`).limit(1).maybeSingle();
  if (existing) await supabase.from("items").update({ done: false }).eq("id", existing.id);
  else await supabase.from("items").insert({ section_id: list.id, title, position: Date.now() / 1000 });
  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}

export async function deletePet(petId: string) {
  const { supabase } = await requireHome();
  await supabase.from("pets").delete().eq("id", petId);
  revalidatePath("/");
  redirect("/");
}

/**
 * Disconnects a Subscriptions space from its Gmail. Google access is revoked
 * only when no other space still uses that inbox (revoking ends them all).
 */
/** Disconnects Google Calendar for this person (Gmail spaces are untouched). */
export async function disconnectCalendar(): Promise<Result> {
  const { user } = await requireHome();
  const db = createSupabaseAdmin();
  const { data } = await db.from("calendar_connections").select("refresh_token").eq("user_id", user.id).maybeSingle();
  if (data) await revokeToken(openToken(data.refresh_token));
  await db.from("calendar_connections").delete().eq("user_id", user.id);
  revalidatePath("/me");
  return { ok: true };
}

/** Adds a dated item to the user's Google Calendar as an all-day event, or moves the one it already has. */
export async function syncItemToCalendar(itemId: string): Promise<Result> {
  const { supabase, user, profile } = await requireHome();
  const { data: item } = await supabase.from("items").select("id,title,due_at,gcal_event_id,sections(title)").eq("id", itemId).single();
  if (!item) return { ok: false, error: "Not found" };
  const db = createSupabaseAdmin();
  const access = await calendarAccess(db, user.id);
  if (!access) return { ok: false, error: "not_connected" };
  if (!item.due_at) {
    if (item.gcal_event_id) await deleteEvent(access, item.gcal_event_id);
    await supabase.from("items").update({ gcal_event_id: null }).eq("id", itemId);
    return { ok: true };
  }
  const section = item.sections as unknown as { title: string } | null;
  const id = await upsertEvent(access, { title: item.title, description: section?.title, day: todayKey(profile.timezone, new Date(item.due_at)), timeZone: profile.timezone }, item.gcal_event_id);
  await supabase.from("items").update({ gcal_event_id: id }).eq("id", itemId);
  return { ok: true };
}

export async function disconnectGmail(sectionId: string): Promise<Result> {
  const { supabase } = await requireHome();
  const { data: section } = await supabase.from("sections").select("id").eq("id", sectionId).maybeSingle();
  if (!section) return { ok: false, error: "Not found" };
  const db = createSupabaseAdmin();
  const { data: conn } = await db.from("gmail_connections").select("email,refresh_token").eq("section_id", sectionId).maybeSingle();
  if (!conn) return { ok: true };
  await db.from("gmail_connections").delete().eq("section_id", sectionId);
  const { count } = await db.from("gmail_connections").select("section_id", { count: "exact", head: true }).eq("email", conn.email ?? "");
  if (!count) {
    try {
      await revokeToken(openToken(conn.refresh_token));
    } catch {
      // Unreadable token: deleting it is enough.
    }
  }
  revalidatePath(`/sections/${sectionId}`);
  revalidatePath("/me");
  return { ok: true };
}
