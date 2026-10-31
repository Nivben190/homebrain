import { beforeAll, describe, expect, it, vi } from "vitest";
import { app, homeWith, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";

vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { tick, handleEvent, fireAutomation } = await import("./execute");
const db = () => testClient(app.db);

beforeAll(startApp, 120_000);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const todayIn = (tz = "Asia/Jerusalem", d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
const hhmm = (d = new Date(), tz = "Asia/Jerusalem") => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

async function automation(householdId: string, userId: string, fields: Record<string, unknown>) {
  const row = {
    household_id: householdId,
    owner_id: userId,
    target_user_id: userId,
    name: "Test",
    enabled: true,
    trigger: { type: "schedule", days: [0, 1, 2, 3, 4, 5, 6], times: ["08:00"] },
    conditions: [],
    actions: [{ type: "push", title: "Hello", body: "World" }],
    ...fields,
  };
  const { data, error } = await db().from("automations").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
async function space(householdId: string, fields: Record<string, unknown> = {}) {
  const { data } = await db().from("sections").insert({ household_id: householdId, title: "Space", icon: "🐕", ...fields }).select("id").single();
  return data!.id as string;
}
async function item(sectionId: string, fields: Record<string, unknown>) {
  const { data, error } = await db().from("items").insert({ section_id: sectionId, title: "Thing", ...fields }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}
// Card pushes only: between 09:30 and 10:00 Israel time the daily briefing also buzzes these new homes.
const cardPushes = () => app.pushes.filter((p) => p.opts?.runId);
const runsFor = (userId: string) => sql<{ title: string; item_id: string | null; acknowledged_at: unknown }>(`select title, item_id, acknowledged_at from runs where user_id = $1 order by fired_at`, [userId]);

describe("schedules", () => {
  it("a due schedule fires once, pushes, logs, and moves to its next time", async () => {
    const home = await homeWith(["owner"]);
    const a = await automation(home.householdId, home.users.owner, { next_run_at: minutesAgo(1) });
    app.pushes = [];
    const { phases, outcomes } = await tick(db());
    expect(phases.every((p) => p.ok)).toBe(true);
    expect(outcomes.filter((o) => o.automationId === a.id).map((o) => o.status)).toEqual(["fired"]);
    expect(cardPushes().filter((p) => p.userId === home.users.owner).map((p) => p.payload.title)).toEqual(["⚡ Hello"]);
    expect(await sql(`select status from automation_log where automation_id = $1`, [a.id])).toEqual([{ status: "fired" }]);
    const [{ next_run_at }] = await sql<{ next_run_at: Date }>(`select next_run_at from automations where id = $1`, [a.id]);
    expect(new Date(next_run_at).getTime()).toBeGreaterThan(Date.now());
    // The next tick has nothing to do for it.
    expect((await tick(db())).outcomes.filter((o) => o.automationId === a.id)).toEqual([]);
  });

  it("after downtime, a schedule more than 30 minutes late is skipped, not fired", async () => {
    const home = await homeWith(["owner"]);
    const a = await automation(home.householdId, home.users.owner, { next_run_at: minutesAgo(45) });
    const { outcomes } = await tick(db());
    expect(outcomes.find((o) => o.automationId === a.id)).toMatchObject({ status: "skipped", reason: "too late" });
    expect(await runsFor(home.users.owner)).toEqual([]);
  });

  it("an invalid definition is logged as invalid, and once_per_day holds", async () => {
    const home = await homeWith(["owner"]);
    const bad = await automation(home.householdId, home.users.owner, { actions: [] });
    expect(await fireAutomation(db(), bad)).toMatchObject({ status: "invalid" });
    const once = await automation(home.householdId, home.users.owner, { conditions: [{ type: "once_per_day" }] });
    expect((await fireAutomation(db(), once)).status).toBe("fired");
    expect(await fireAutomation(db(), once)).toMatchObject({ status: "skipped", reason: "conditions" });
  });

  it("creates items only in this home's spaces; email without setup says so on the card", async () => {
    const home = await homeWith(["owner"]);
    const other = await homeWith(["owner"]);
    const mine = await space(home.householdId);
    const theirs = await space(other.householdId);
    const a = await automation(home.householdId, home.users.owner, {
      actions: [
        { type: "create_item", sectionId: mine, title: "Take out bins" },
        { type: "create_item", sectionId: theirs, title: "Sneaky" },
        { type: "email", to: "x@example.com", subject: "Hi", body: "Hello" },
      ],
    });
    const out = await fireAutomation(db(), a);
    expect(out.status).toBe("fired");
    expect(out.reason).toMatch(/outside this home/);
    expect(await sql(`select title from items where section_id = $1`, [mine])).toEqual([{ title: "Take out bins" }]);
    expect(await sql(`select title from items where section_id = $1`, [theirs])).toEqual([]);
    const [{ rendered }] = await sql<{ rendered: { kind: string; text?: string }[] }>(`select rendered from runs where id = $1`, [out.runId]);
    expect(rendered.some((r) => r.kind === "note" && /isn't set up/.test(r.text ?? ""))).toBe(true);
  });

  it("quiet hours keep the card but hold back the buzz", async () => {
    const home = await homeWith(["owner"]);
    const now = new Date();
    await sql(`update profiles set quiet_from = $1, quiet_to = $2 where user_id = $3`, [hhmm(new Date(now.getTime() - 60 * 60_000)), hhmm(new Date(now.getTime() + 60 * 60_000)), home.users.owner]);
    const a = await automation(home.householdId, home.users.owner, {});
    app.pushes = [];
    expect((await fireAutomation(db(), a)).status).toBe("fired");
    expect(app.pushes).toEqual([]);
    expect(await runsFor(home.users.owner)).toHaveLength(1);
  });
});

describe("events and queued jobs", () => {
  it("an event fires now, or queues with a delay and the tick runs it", async () => {
    const home = await homeWith(["owner"]);
    const now = await automation(home.householdId, home.users.owner, { trigger: { type: "event", event: "leave_home", delayMinutes: 0 } });
    const later = await automation(home.householdId, home.users.owner, { trigger: { type: "event", event: "leave_home", delayMinutes: 10 } });
    const outcomes = await handleEvent(db(), home.users.owner, "leave_home");
    expect(outcomes.find((o) => o.automationId === now.id)?.status).toBe("fired");
    expect(outcomes.find((o) => o.automationId === later.id)?.reason).toMatch(/^queued/);
    await sql(`update jobs set run_at = now() - interval '1 minute' where automation_id = $1`, [later.id]);
    const { outcomes: ticked } = await tick(db());
    expect(ticked.find((o) => o.automationId === later.id)?.status).toBe("fired");
    expect(await sql(`select status from jobs where automation_id = $1`, [later.id])).toEqual([{ status: "done" }]);
  });

  it("someone on a fixed wake time gets their wake event once", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set wake_mode = 'fixed', wake_time = $1 where user_id = $2`, [hhmm(new Date(Date.now() - 5 * 60_000)), home.users.owner]);
    const a = await automation(home.householdId, home.users.owner, { trigger: { type: "event", event: "wake", delayMinutes: 0 } });
    expect((await tick(db())).outcomes.filter((o) => o.automationId === a.id).map((o) => o.status)).toEqual(["fired"]);
    expect((await tick(db())).outcomes.filter((o) => o.automationId === a.id)).toEqual([]);
  });
});

describe("item reminders", () => {
  it("a tracker session reminds whoever's on it, once, and not after it's checked in", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId, { view: "tracker", title: "Dog" });
    const habit = { repeat: { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6] }, time: hhmm(new Date(Date.now() - 60_000)), nudge: false };
    const walk = await item(s, { title: "Walk", props: { _habit: habit }, remind_at: minutesAgo(1), created_by: home.users.owner });
    app.pushes = [];
    const first = await tick(db());
    expect(first.outcomes.find((o) => o.automationId === walk)?.status).toBe("fired");
    expect(cardPushes().map((p) => p.userId)).toEqual([home.users.owner]);
    // Worded for a dog space (roadmap: space voices).
    const { en } = await import("@/i18n/en");
    expect([...en.voice.dog.start, ...en.voice.dog.streak]).toContain(cardPushes()[0].payload.body);
    // Checked in: the next reminder that comes due today stays silent.
    await sql(`insert into checkins (item_id, day, user_id) values ($1, $2, $3)`, [walk, todayIn(), home.users.owner]);
    await sql(`update items set remind_at = $2 where id = $1`, [walk, minutesAgo(1)]);
    const second = await tick(db());
    expect(second.outcomes.find((o) => o.automationId === walk)).toMatchObject({ status: "skipped" });
  });

  it("a due date with 'remind me before' alerts its assignee once", async () => {
    const home = await homeWith(["owner", "adult"]);
    const s = await space(home.householdId);
    const due = new Date(Date.now() + 60 * 60_000).toISOString();
    const id = await item(s, { title: "Dentist", due_at: due, remind_at: minutesAgo(1), props: { _remind: 60 }, assignee_id: home.users.adult });
    app.pushes = [];
    expect((await tick(db())).outcomes.find((o) => o.automationId === id)?.status).toBe("fired");
    expect(cardPushes().map((p) => p.userId)).toEqual([home.users.adult]);
    expect(await sql(`select remind_at from items where id = $1`, [id])).toEqual([{ remind_at: null }]);
  });

  it("a reminder-calendar date alerts today and replaces the earlier unanswered card", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId, { view: "dates" });
    const spec = { date: todayIn(), repeat: "once", from: "00:00", until: "23:59", every: 1, ahead: 0, carry: false };
    const id = await item(s, { title: "Passport", props: { _dates: spec } });
    // Let the engine plan the next alert, then fire it at exactly that moment.
    const { rescheduleDate, fireItemReminder } = await import("./execute");
    const fire = async () => {
      const [{ remind_at }] = await sql<{ remind_at: Date | null }>(`select remind_at from items where id = $1`, [id]);
      expect(remind_at).not.toBeNull();
      const at = new Date(remind_at!);
      return fireItemReminder(db(), id, at, new Date(at.getTime() + 1000));
    };
    await rescheduleDate(db(), id, spec as never, "Asia/Jerusalem", new Set(), new Date(`${todayIn()}T00:00:00+02:00`));
    expect((await fire()).status).toBe("fired");
    expect((await fire()).status).toBe("fired");
    const cards = await runsFor(home.users.owner);
    expect(cards.map((c) => c.acknowledged_at === null)).toEqual([false, true]);
  });

  it("an item with no schedule just clears its reminder", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId);
    const id = await item(s, { title: "Plain", remind_at: minutesAgo(1) });
    expect((await tick(db())).outcomes.find((o) => o.automationId === id)).toMatchObject({ status: "skipped", reason: "no schedule" });
    expect(await sql(`select remind_at from items where id = $1`, [id])).toEqual([{ remind_at: null }]);
  });
});

describe("heartbeat", () => {
  it("every phase reports, even when there's nothing to do", async () => {
    const { phases } = await tick(db());
    expect(phases.map((p) => p.phase)).toEqual(["schedules", "fixed wakes", "daily", "item reminders", "queued jobs", "plan cheers"]);
    expect(phases.every((p) => p.ok)).toBe(true);
  });
});
