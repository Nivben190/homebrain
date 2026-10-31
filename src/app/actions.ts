"use server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getLocale, getSession, requireHome } from "@/lib/session";
import { HOUSEHOLD_KINDS, seedStarterBrain, type HomeShape } from "@/lib/starter";
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
import { openToken, revokeToken, sealToken } from "@/lib/subs/gmail";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n";
import type { Automation, RequestRow, Role } from "@/lib/db-types";
import { allow, clientIp } from "@/lib/rate-limit";
import { zonedTimeToUtc } from "@/lib/engine/time";
import { newCommit } from "@/lib/commit";
import { readPlan } from "@/lib/plan";
import { RECIPES, type RecipeId } from "@/lib/registry/recipes";
import { createFromShape, readSharedTemplate, shapeOf } from "@/lib/space-copy";
import { SNOOZE_CHOICES, snoozeUntil, type SnoozeChoice } from "@/lib/snooze";
import { guestLinkOpen, guestMayTick, isGuestToken, type GuestLink } from "@/lib/guest-links";
import { INGREDIENTS_PROP, parseIngredients, readIngredients, shoppingFor } from "@/lib/meals";
import { AMOUNT_PROP } from "@/lib/money";
import { HOOK_PURPOSES, hashKey, newKey, type HookPurpose } from "@/lib/hook-keys";
import { sendEmail } from "@/lib/email";
import { signupAlert, type SignupVia } from "@/lib/signup-alert";

type Result<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const PASSWORD_MIN = 10;

const accountInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  // 10+ (roadmap 0.8); Supabase's own minimum is set to match.
  password: z.string().min(PASSWORD_MIN, "too_short"),
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
  const via: SignupVia = isInviteToken(input.inviteCode?.trim() ?? "") && invited ? "link" : invited ? "code" : (count ?? 0) > 0 ? "allowed" : "first";
  await tellOwnerAboutSignup(admin, email, via);
  return { ok: true };
}

/** An email to the app's owner (SIGNUP_ALERT_EMAIL) about a new account. Never holds up or fails the sign-up. */
async function tellOwnerAboutSignup(admin: ReturnType<typeof createSupabaseAdmin>, email: string, via: SignupVia) {
  const to = process.env.SIGNUP_ALERT_EMAIL;
  if (!to) return;
  try {
    const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true });
    const { subject, body } = signupAlert({ email, via, accounts: count ?? null, at: new Date(), appUrl: process.env.NEXT_PUBLIC_APP_URL });
    await sendEmail(to, subject, body);
  } catch (e) {
    console.error("[signup] alert failed", e);
  }
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

/** Ties a routine space to one pet, or (null) shares it across all of them (roadmap 3.10). */
export async function linkRoutine(sectionId: string, petId: string | null): Promise<Result> {
  const { supabase } = await requireHome();
  // RLS shows only this home's pets, so a foreign id finds nothing.
  if (petId && !(await supabase.from("pets").select("id").eq("id", petId).maybeSingle()).data) return { ok: false, error: "not allowed" };
  const { data, error } = await supabase.from("sections").update({ pet_id: petId }).eq("id", sectionId).select("id");
  revalidatePath("/pets", "layout");
  if (error) return { ok: false, error: error.message };
  return data.length ? { ok: true } : { ok: false, error: "permission denied" };
}

// ---------------------------------------------------------------------------
// Home info card (roadmap 3.9)
// ---------------------------------------------------------------------------

const homeInfoInput = z.object({
  wifi_name: z.string().trim().max(64).nullable(),
  wifi_password: z.string().max(128).nullable(),
  info: z.object({
    accounts: z.array(z.object({ label: z.string().max(60), value: z.string().max(120) })).max(30).default([]),
    contacts: z.array(z.object({ label: z.string().max(60), phone: z.string().max(40) })).max(30).default([]),
    vet: z.object({ name: z.string().max(80), phone: z.string().max(40) }).default({ name: "", phone: "" }),
    notes: z.string().max(2000).default(""),
  }),
  guest_fields: z.array(z.enum(["wifi", "contacts", "vet", "notes"])).default(["wifi", "contacts", "vet"]),
});
export type HomeInfoInput = z.input<typeof homeInfoInput>;

export async function saveHomeInfo(input: HomeInfoInput): Promise<Result> {
  const { supabase, household } = await requireHome();
  const parsed = homeInfoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await supabase.from("home_info").upsert({ household_id: household.id, ...parsed.data, updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Alarm codes and the like: sealed with the app key, owner-only both ways. */
export async function readHomeSecrets(): Promise<Result<string>> {
  const { profile, household } = await requireHome();
  if (profile.role !== "owner") return { ok: false, error: "owner only" };
  const { data } = await createSupabaseAdmin().from("home_info").select("secrets").eq("household_id", household.id).maybeSingle();
  return { ok: true, data: data?.secrets ? openToken(data.secrets) : "" };
}

export async function saveHomeSecrets(text: string): Promise<Result> {
  const { profile, household } = await requireHome();
  if (profile.role !== "owner") return { ok: false, error: "owner only" };
  const { error } = await createSupabaseAdmin().from("home_info").upsert({ household_id: household.id, secrets: text.trim() ? sealToken(text.slice(0, 4000)) : null, updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------------
// Meal plan (roadmap 3.5)
// ---------------------------------------------------------------------------

export async function planMeal(day: string, itemId: string | null): Promise<Result> {
  const { supabase, household } = await requireHome();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "bad day" };
  const q = itemId
    ? supabase.from("meal_plan").upsert({ household_id: household.id, day, item_id: itemId })
    : supabase.from("meal_plan").delete().eq("household_id", household.id).eq("day", day);
  const { error } = await q;
  revalidatePath("/meals");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function saveIngredients(itemId: string, text: string): Promise<Result> {
  const { supabase } = await requireHome();
  const { data: item } = await supabase.from("items").select("props").eq("id", itemId).single();
  if (!item) return { ok: false, error: "not found" };
  const { error } = await supabase.from("items").update({ props: { ...item.props, [INGREDIENTS_PROP]: parseIngredients(text) } }).eq("id", itemId);
  revalidatePath("/meals");
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** One tap: the week's missing ingredients onto Groceries, checking the Fridge first. */
export async function shopForPlan(from: string, to: string): Promise<Result<{ added: string[] }>> {
  const { supabase } = await requireHome();
  const [{ data: plan }, { data: spaces }] = await Promise.all([
    supabase.from("meal_plan").select("items(props)").gte("day", from).lte("day", to).returns<{ items: { props: Record<string, unknown> } | null }[]>(),
    supabase.from("sections").select("id,view,template").is("owner_id", null),
  ]);
  const groceries = (spaces ?? []).find((s) => s.template === "groceries") ?? (spaces ?? []).find((s) => s.view === "checklist" || s.view === "list");
  if (!groceries) return { ok: false, error: "no list" };
  const fridgeIds = (spaces ?? []).filter((s) => s.view === "fridge").map((s) => s.id);
  const [{ data: fridge }, { data: onList }] = await Promise.all([
    fridgeIds.length ? supabase.from("items").select("title,props").in("section_id", fridgeIds) : Promise.resolve({ data: [] as { title: string; props: Record<string, unknown> }[] }),
    supabase.from("items").select("title").eq("section_id", groceries.id).eq("done", false),
  ]);
  const ingredients = (plan ?? []).flatMap((p) => (p.items ? readIngredients(p.items.props) : []));
  const added = shoppingFor(ingredients, fridge ?? [], (onList ?? []).map((i) => i.title));
  if (added.length) {
    const base = Date.now() / 1000;
    const { error } = await supabase.from("items").insert(added.map((title, n) => ({ section_id: groceries.id, title, position: base + n })));
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { added } };
}

// ---------------------------------------------------------------------------
// Household money (roadmap 3.6)
// ---------------------------------------------------------------------------

export async function setBudget(category: string, amount: number | null): Promise<Result> {
  const { supabase, household, profile } = await requireHome();
  if (profile.role !== "owner" && profile.role !== "adult") return { ok: false, error: "permission denied" };
  if (!/^[a-z_]{1,30}$/.test(category) || (amount !== null && !(amount >= 0))) return { ok: false, error: "bad input" };
  const { error } =
    amount === null
      ? await supabase.from("money_budgets").delete().eq("household_id", household.id).eq("category", category)
      : await supabase.from("money_budgets").upsert({ household_id: household.id, category, amount });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setBillAmount(itemId: string, amount: number | null): Promise<Result> {
  const { supabase } = await requireHome();
  if (amount !== null && !(amount >= 0)) return { ok: false, error: "bad input" };
  const { data: item } = await supabase.from("items").select("props").eq("id", itemId).single();
  if (!item) return { ok: false, error: "not found" };
  const { data, error } = await supabase.from("items").update({ props: { ...item.props, [AMOUNT_PROP]: amount } }).eq("id", itemId).select("id");
  if (error) return { ok: false, error: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "permission denied" };
}

// ---------------------------------------------------------------------------
// Sitter and guest links (roadmap 3.3)
// ---------------------------------------------------------------------------

export async function createGuestLink(input: { sectionId: string | null; includeInfo: boolean; days: number; label: string }): Promise<Result<{ token: string }>> {
  const { supabase, user, profile, household } = await requireHome();
  if (profile.role === "child" || profile.role === "guest") return { ok: false, error: "not allowed" };
  // Only a shared space of this home: the guest page reads it with the service role.
  if (input.sectionId) {
    const { data: s } = await supabase.from("sections").select("id").eq("id", input.sectionId).eq("household_id", household.id).is("owner_id", null).maybeSingle();
    if (!s) return { ok: false, error: "not allowed" };
  }
  const days = Math.min(Math.max(Math.round(input.days), 1), 30);
  const { data, error } = await supabase
    .from("guest_links")
    .insert({ household_id: household.id, section_id: input.sectionId, include_info: input.includeInfo, label: input.label.trim().slice(0, 40), created_by: user.id, expires_at: new Date(Date.now() + days * 86_400_000).toISOString() })
    .select("token")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/home-info");
  return { ok: true, data: { token: data.token } };
}

/** A template link for one space: a snapshot of its structure, which anyone signed in can add to their own home. */
export async function shareSpaceTemplate(sectionId: string): Promise<Result<{ token: string }>> {
  const { supabase, user, household } = await requireHome();
  const { data: section } = await supabase.from("sections").select("title,icon,color,view,template,schema").eq("id", sectionId).eq("household_id", household.id).maybeSingle();
  if (!section) return { ok: false, error: "not allowed" };
  const { data: items } = await supabase.from("items").select("title,props,position").eq("section_id", sectionId);
  const shape = shapeOf(section, items ?? []);
  const { data, error } = await supabase.from("space_templates").insert({ household_id: household.id, section_id: sectionId, shape, created_by: user.id }).select("token").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { token: data.token } };
}

/** Ends every template link to this space; links already opened stop working. */
export async function unshareSpaceTemplate(sectionId: string): Promise<Result> {
  const { supabase } = await requireHome();
  const { data, error } = await supabase.from("space_templates").delete().eq("section_id", sectionId).select("token");
  if (error) return { ok: false, error: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "permission denied" };
}

/** Adds a copy of a shared template to the visitor's home (their role decides whether they may). */
export async function addSharedSpace(token: string): Promise<Result<{ id: string }>> {
  const { supabase, user, profile, household } = await requireHome();
  const shape = await readSharedTemplate(createSupabaseAdmin(), token);
  if (!shape) return { ok: false, error: "not found" };
  const res = await createFromShape(supabase, shape, { householdId: household.id, ownerId: profile.role === "teen" ? user.id : null, title: shape.title, timeZone: profile.timezone });
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath("/sections");
  return { ok: true, data: res };
}

/** "Make a space like this": a new space with this one's structure; private stays private, and a teen's is theirs. */
export async function copySpace(sectionId: string, title: string): Promise<Result<{ id: string }>> {
  const { supabase, user, profile, household } = await requireHome();
  const { data: section } = await supabase.from("sections").select("title,icon,color,view,template,schema,owner_id").eq("id", sectionId).eq("household_id", household.id).maybeSingle();
  if (!section) return { ok: false, error: "not allowed" };
  const { data: items } = await supabase.from("items").select("title,props,position").eq("section_id", sectionId);
  const res = await createFromShape(supabase, shapeOf(section, items ?? []), {
    householdId: household.id,
    ownerId: section.owner_id || profile.role === "teen" ? user.id : null,
    title: title.trim().slice(0, 80) || section.title,
    timeZone: profile.timezone,
  });
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath("/sections");
  return { ok: true, data: res };
}

export async function revokeGuestLink(token: string): Promise<Result> {
  const { supabase } = await requireHome();
  const { error } = await supabase.from("guest_links").update({ revoked_at: new Date().toISOString() }).eq("token", token);
  revalidatePath("/home-info");
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** A guest's tick, with no account: checked against the link on every call. */
export async function guestTick(token: string, itemId: string): Promise<Result> {
  if (!isGuestToken(token)) return { ok: false, error: "expired" };
  const db = createSupabaseAdmin();
  if (!(await allow(db, "guest", token))) return { ok: false, error: "too_many" };
  const { data: link } = await db.from("guest_links").select("*").eq("token", token).maybeSingle<GuestLink>();
  if (!link || !guestLinkOpen(link)) return { ok: false, error: "expired" };
  const { data: item } = await db.from("items").select("id,section_id,done,sections(view)").eq("id", itemId).maybeSingle<{ id: string; section_id: string; done: boolean; sections: { view: string } | null }>();
  if (!item || !guestMayTick(link, item)) return { ok: false, error: "not allowed" };
  const who = link.label || "Guest";
  if (item.sections?.view === "tracker") {
    const { data: me } = await db.from("profiles").select("timezone").eq("household_id", link.household_id).limit(1).maybeSingle();
    const day = todayKey(me?.timezone ?? "Asia/Jerusalem");
    await db.from("checkins").upsert({ item_id: item.id, day, status: "done", user_id: null, guest_label: who }, { onConflict: "item_id,day" });
  } else {
    // Guests only tick; undoing is left to the family.
    if (!item.done) await db.from("items").update({ done: true, updated_at: new Date().toISOString() }).eq("id", item.id);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Members and roles (roadmap 3.1)
// ---------------------------------------------------------------------------

async function homeRpc(fn: string, args?: Record<string, unknown>): Promise<Result> {
  const { supabase } = await requireHome();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
export const setMemberRole = async (userId: string, role: Role) => homeRpc("set_member_role", { p_user: userId, p_role: role });
export const removeMember = async (userId: string) => homeRpc("remove_member", { p_user: userId });
export const rotateInvite = async () => homeRpc("rotate_invite");
export async function leaveHome(): Promise<Result> {
  const res = await homeRpc("leave_home");
  if (res.ok) redirect("/onboarding");
  return res;
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

const homeShape = z.object({ who: z.enum(HOUSEHOLD_KINDS), dog: z.boolean(), kids: z.boolean() });

export async function setupHome(input: {
  mode: "create" | "join";
  homeName?: string;
  inviteCode?: string;
  starter: boolean;
  /** The onboarding answers, for a new home. */
  home?: HomeShape;
  displayName: string;
  emoji: string;
  phone?: string;
  timezone?: string;
}): Promise<Result> {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return { ok: false, error: "Not signed in" };
  const p = profileInput.parse(input);
  // The language the person set up in (the switch, or the phone's) becomes theirs.
  const locale = await getLocale();

  await supabase
    .from("profiles")
    .update({ display_name: p.displayName, emoji: p.emoji, phone: p.phone || null, timezone: p.timezone, locale })
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
      locale,
      timezone: p.timezone,
      home: input.mode === "create" ? homeShape.parse(input.home ?? { who: "couple", dog: false, kids: false }) : undefined,
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
  quiet_from: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quiet_to: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  muted_sections: z.array(z.string().uuid()).max(100).optional(),
  digest: z.boolean().optional(),
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
  const { supabase, profile } = await requireHome();
  if (profile.role !== "owner" && profile.role !== "adult") return { ok: false, error: "permission denied" };
  const parsed = z.array(z.string().uuid()).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid order" };
  const results = await Promise.all(parsed.data.map((id, position) => supabase.from("sections").update({ position }).eq("id", id).select("id")));
  const failed = results.find((r) => r.error);
  revalidatePath("/sections");
  if (failed) return { ok: false, error: failed.error!.message };
  // A space RLS hides or refuses updates nothing: say so instead of a silent half-saved order.
  return results.every((r) => r.data?.length) ? { ok: true } : { ok: false, error: "permission denied" };
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

/** One-tap Brain recipe (roadmap 2.7): one automation, or one each when it's for you both. */
export async function addRecipe(id: RecipeId): Promise<Result> {
  const { supabase, user, profile, members } = await requireHome();
  const recipe = RECIPES.find((r) => r.id === id);
  if (!recipe) return { ok: false, error: "unknown recipe" };
  const { data: spaces } = await supabase.from("sections").select("id,view,template").order("position");
  const def = recipe.build({ locale: isLocale(profile.locale) ? profile.locale : "en", spaces: spaces ?? [], hasPartner: members.length > 1 });
  if (!def) return { ok: false, error: "missing" };
  for (const target of recipe.forBoth ? members.map((m) => m.user_id) : [user.id]) {
    const res = await saveAutomation(null, def, target);
    if (!res.ok) return res;
  }
  return { ok: true };
}

export async function toggleAutomation(id: string, enabled: boolean): Promise<Result> {
  const { supabase, members } = await requireHome();
  const { data: a } = await supabase.from("automations").select("*").eq("id", id).single<Automation>();
  if (!a) return { ok: false, error: "Not found" };
  const tz = members.find((m) => m.user_id === a.target_user_id)?.timezone ?? "Asia/Jerusalem";
  const { data, error } = await supabase
    .from("automations")
    .update({ enabled, next_run_at: enabled ? (nextRunAt(a.trigger, new Date(), tz)?.toISOString() ?? null) : null })
    .eq("id", id)
    .select("id");
  revalidatePath("/brain");
  if (error) return { ok: false, error: error.message };
  return data.length ? { ok: true } : { ok: false, error: "permission denied" };
}

export async function deleteAutomation(id: string): Promise<Result> {
  const { supabase } = await requireHome();
  const admin = createSupabaseAdmin();
  // Deleting clears the runs' link, so note its unanswered cards first; they'd otherwise linger in "Waiting for you" (both of us).
  const { data: open } = await admin.from("runs").select("id").eq("automation_id", id).is("acknowledged_at", null);
  const { data, error } = await supabase.from("automations").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data.length) return { ok: false, error: "permission denied" };
  if (open?.length)
    await admin
      .from("runs")
      .update({ acknowledged_at: new Date().toISOString() })
      .in("id", open.map((r) => r.id));
  revalidatePath("/brain");
  revalidatePath("/");
  return { ok: true };
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
  // A plan's card without a Done button (the weekly result) is just read: marking it doesn't log a session.
  const readOnly = !!run?.item_id && !run.rendered?.some((r) => r.kind === "done") && !!readPlan((await supabase.from("items").select("props").eq("id", run.item_id).maybeSingle()).data?.props ?? {});
  if (run?.item_id && !readOnly) {
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

/** Hides a reminder until the chosen time; the engine tick brings it back as a push. */
export async function snoozeRun(id: string, choice: SnoozeChoice): Promise<Result> {
  const { supabase, profile } = await requireHome();
  if (!SNOOZE_CHOICES.includes(choice)) return { ok: false, error: "invalid" };
  const now = new Date();
  const { data, error } = await supabase
    .from("runs")
    .update({ snoozed_until: snoozeUntil(choice, now, profile.timezone).toISOString(), acknowledged_at: now.toISOString() })
    .eq("id", id)
    .select("id");
  revalidatePath("/");
  if (error) return { ok: false, error: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "permission denied" };
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
  // One device, several people (a family tablet): pushes go to whoever turned them on last.
  await createSupabaseAdmin().from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).neq("user_id", user.id);
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      device_label: deviceLabel.slice(0, 60),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Me → Send test: every device, or just one (roadmap 1.10). */
export async function sendTestPush(deviceId?: string): Promise<Result> {
  const { user, profile } = await requireHome();
  const t = getDict(profile.locale).settings;
  const sent = await sendPush(createSupabaseAdmin(), user.id, { title: `🧠 ${t.testPushTitle}`, body: t.testPushBody, url: "/" }, { subscriptionId: deviceId });
  revalidatePath("/me");
  return sent > 0 ? { ok: true } : { ok: false, error: t.testPushFailed };
}

export async function removePushDevice(deviceId: string): Promise<Result> {
  const { supabase } = await requireHome();
  const { data, error } = await supabase.from("push_subscriptions").delete().eq("id", deviceId).select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return data?.length ? { ok: true } : { ok: false, error: "permission denied" };
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
  const { data: req } = await supabase.from("requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle<RequestRow>();
  // Not theirs to answer, or withdrawn meanwhile: nothing changed.
  if (!req) return { ok: false, error: "permission denied" };
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

export async function deleteRequest(id: string): Promise<Result> {
  const { supabase } = await requireHome();
  const { data, error } = await supabase.from("requests").delete().eq("id", id).select("id");
  revalidatePath("/");
  if (error) return { ok: false, error: error.message };
  return data.length ? { ok: true } : { ok: false, error: "permission denied" };
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
  // Keeps a time the date carried ("…T10:30").
  const was = dateProp ? (item.props as Record<string, unknown>)[dateProp.id] : null;
  const props = dateProp ? { ...(item.props as Record<string, unknown>), [dateProp.id]: `${tomorrow}${typeof was === "string" ? was.slice(10) : ""}` } : item.props;
  const due = dateProp ? dueFromProps(schema, props as Record<string, unknown>, profile.timezone) : new Date(new Date(item.due_at!).getTime() + 86400000).toISOString();
  const { data: moved, error } = await supabase.from("items").update({ props, due_at: due }).eq("id", itemId).select("id");
  if (error || !moved?.length) return { ok: false, error: error?.message ?? "permission denied" };
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
  const { data, error } = await supabase.from("pets").update({ bag_started: todayKey(profile.timezone), food_alerted_bag: null }).eq("id", petId).select("id");
  revalidatePath(`/pets/${petId}`);
  if (error) return { ok: false, error: error.message };
  return data.length ? { ok: true } : { ok: false, error: "permission denied" };
}

/** Adds "Dog food" to the dog supplies list (or groceries), re-opening it if it's in history. */
export async function reorderFood(petId: string): Promise<Result> {
  const { supabase, profile, household } = await requireHome();
  const { data: pet } = await supabase.from("pets").select("name").eq("id", petId).maybeSingle();
  if (!pet) return { ok: false, error: "permission denied" };
  const { data: lists } = await supabase.from("sections").select("id,template").eq("household_id", household.id).in("template", ["dog-supplies", "groceries"]);
  const list = lists?.find((l) => l.template === "dog-supplies") ?? lists?.[0];
  if (!list) return { ok: false, error: "No shopping list" };
  const t = getDict(profile.locale).pets;
  const title = fill(t.foodItem, { name: pet.name });
  const { data: existing } = await supabase.from("items").select("id").eq("section_id", list.id).ilike("title", `%${t.foodWord}%`).limit(1).maybeSingle();
  const { error } = existing ? await supabase.from("items").update({ done: false }).eq("id", existing.id) : await supabase.from("items").insert({ section_id: list.id, title, position: Date.now() / 1000 });
  revalidatePath(`/pets/${petId}`);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** The screen goes back to Today itself once this says it worked. */
export async function deletePet(petId: string): Promise<Result> {
  const { supabase } = await requireHome();
  const { data, error } = await supabase.from("pets").delete().eq("id", petId).select("id");
  revalidatePath("/");
  if (error) return { ok: false, error: error.message };
  return data.length ? { ok: true } : { ok: false, error: "permission denied" };
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
