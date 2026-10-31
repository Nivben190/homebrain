import { beforeAll, describe, expect, it, vi } from "vitest";
import { app, homeWith, signIn, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";
import { addDays, todayKey } from "@/lib/engine/habits";
import { zonedTimeToUtc } from "@/lib/engine/time";
import { nextPlanReminder, weekOf, type PlanSpec } from "@/lib/plan";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const P = await import("./plan-actions");
const { tick, fireItemReminder } = await import("@/lib/engine/execute");
const db = () => testClient(app.db);
const TZ = "Asia/Jerusalem";

beforeAll(startApp, 120_000);

async function planSpace(householdId: string) {
  const [{ id }] = await sql<{ id: string }>(`insert into sections (household_id, title, icon, view, template) values ($1, 'Training', '🏋️', 'plan', 'training') returning id`, [householdId]);
  return id;
}
const everyDay = (today: string, over: Partial<PlanSpec> = {}): PlanSpec => ({
  start: weekOf(today),
  from: weekOf(today),
  weeks: 4,
  perWeek: 3,
  time: "18:30",
  nudge: true,
  sessions: [{ id: "s1", name: "Workout", days: [0, 1, 2, 3, 4, 5, 6], steps: [{ id: "bench", name: "Bench", sets: 3, reps: 8, amount: 40, unit: "kg" }] }],
  moves: [],
  reviewed: {},
  ...over,
});
const names = async (ids: string[]) => Object.fromEntries((await sql<{ user_id: string; display_name: string }>(`select user_id, display_name from profiles where user_id = any($1)`, [ids])).map((r) => [r.user_id, r.display_name]));

describe("plans", () => {
  it("saving a plan schedules its reminder; logging a session keeps what was done and tells the partner", async () => {
    const home = await homeWith(["owner", "adult"]);
    await sql(`update profiles set locale = 'en', timezone = $2 where household_id = $1`, [home.householdId, TZ]);
    const sectionId = await planSpace(home.householdId);
    const today = todayKey(TZ);
    signIn(home.users.owner);
    const saved = await P.savePlan({ id: null, sectionId, title: "Get strong", spec: everyDay(today), ownerId: home.users.owner });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.assignee_id).toBe(home.users.owner);
    expect(saved.data.remind_at).not.toBeNull();

    const log = { session: "s1", steps: [{ id: "bench", done: true, sets: 3, reps: 8, amount: 45 }], minutes: 50, feel: 5 };
    const logged = await P.logPlanSession({ itemId: saved.data.id, day: today, status: "done", log, note: "New best" });
    expect(logged.ok && logged.data.data).toMatchObject(log);
    // Too far back, or in the future, is refused.
    expect(await P.logPlanSession({ itemId: saved.data.id, day: addDays(today, -5), status: "done" })).toMatchObject({ ok: false, error: "invalid" });
    expect(await P.logPlanSession({ itemId: saved.data.id, day: addDays(today, 1), status: "done" })).toMatchObject({ ok: false, error: "invalid" });

    app.pushes = [];
    await tick(db());
    const n = await names([home.users.owner]);
    const cheers = app.pushes.filter((p) => p.payload.title.includes("finished"));
    expect(cheers.map((p) => p.userId)).toEqual([home.users.adult]);
    expect(cheers[0].payload.title).toBe(`🏋️ ${n[home.users.owner]} finished Get strong 💪`);
    expect(cheers[0].payload.body).toMatch(/^Week \d: 1 of 3 · 50 min 🤩$/);
    // Once only.
    app.pushes = [];
    await tick(db());
    expect(app.pushes.filter((p) => p.payload.title.includes("finished"))).toEqual([]);

    // The partner reacts; the owner hears about it. Reacting again takes it back.
    signIn(home.users.adult);
    const checkinId = logged.ok ? logged.data.id : "";
    const reacted = await P.reactToSession(checkinId, "🔥");
    expect(reacted).toMatchObject({ ok: true, data: { [home.users.adult]: "🔥" } });
    expect(app.pushes.filter((p) => p.userId === home.users.owner).map((p) => p.payload.title)).toEqual([expect.stringContaining("reacted 🔥")]);
    expect(await P.reactToSession(checkinId, "")).toMatchObject({ ok: true, data: {} });
    expect(await P.reactToSession(checkinId, "💩")).toMatchObject({ ok: false, error: "invalid" });
  });

  it("a session reminder goes to whoever committed, with a Done that checks it in", async () => {
    const home = await homeWith(["owner", "adult"]);
    await sql(`update profiles set locale = 'en', timezone = $2, quiet_from = null, quiet_to = null, quiet_shabbat = false where household_id = $1`, [home.householdId, TZ]);
    const sectionId = await planSpace(home.householdId);
    const today = todayKey(TZ);
    const spec = everyDay(today, { time: "00:01", nudge: false });
    const [{ id }] = await sql<{ id: string }>(`insert into items (section_id, title, props, assignee_id) values ($1, 'Gym', $2, $3) returning id`, [sectionId, { _plan: spec }, home.users.adult]);
    const dueAt = zonedTimeToUtc(+today.slice(0, 4), +today.slice(5, 7), +today.slice(8, 10), 0, 1, TZ);
    app.pushes = [];
    const out = await fireItemReminder(db(), id, dueAt, new Date(dueAt.getTime() + 1000));
    expect(out.status).toBe("fired");
    expect(app.pushes.map((p) => [p.userId, p.payload.title])).toEqual([[home.users.adult, "🏋️ Gym today"]]);
    const [run] = await sql<{ rendered: { kind: string }[] }>(`select rendered from runs where item_id = $1`, [id]);
    expect(run.rendered.map((r) => r.kind)).toEqual(["done", "link"]);
  });

  it("Saturday evening: a missed week tells both, with the stake; the last week settles the plan", async () => {
    const home = await homeWith(["owner", "adult"]);
    await sql(`update profiles set locale = 'en', timezone = $2, quiet_from = null, quiet_to = null, quiet_shabbat = false where household_id = $1`, [home.householdId, TZ]);
    const sectionId = await planSpace(home.householdId);
    const lastSunday = addDays(weekOf(todayKey(TZ)), -14);
    const spec = everyDay(lastSunday, { weeks: 2, stake: "Dishes for a week" });
    const [{ id }] = await sql<{ id: string }>(`insert into items (section_id, title, props, assignee_id) values ($1, 'Gym', $2, $3) returning id`, [sectionId, { _plan: spec }, home.users.owner]);
    // Week 1: one session of three.
    await sql(`insert into checkins (item_id, day, status, user_id) values ($1, $2, 'done', $3)`, [id, lastSunday, home.users.owner]);
    const review = (week: string) => {
      const sat = addDays(week, 6);
      return zonedTimeToUtc(+sat.slice(0, 4), +sat.slice(5, 7), +sat.slice(8, 10), 21, 0, TZ);
    };
    const n = await names([home.users.owner]);

    app.pushes = [];
    await fireItemReminder(db(), id, review(lastSunday), new Date(review(lastSunday).getTime() + 1000));
    const byUser = Object.fromEntries(app.pushes.map((p) => [p.userId, p.payload]));
    expect(byUser[home.users.owner]).toMatchObject({ title: "🏋️ 😬 Week 1 missed: Gym", body: "1 of 3. Next week is a new week. The stake: Dishes for a week" });
    expect(byUser[home.users.adult]).toMatchObject({ title: `🏋️ 😏 ${n[home.users.owner]} missed week 1: Gym`, body: "1 of 3. You're owed: Dishes for a week" });
    const [{ props }] = await sql<{ props: { _plan: PlanSpec } }>(`select props from items where id = $1`, [id]);
    expect(props._plan.reviewed).toEqual({ [lastSunday]: 1 });

    // Week 2 kept, and it was the last: 1 of 2 weeks is under 75%, so not kept.
    const week2 = addDays(lastSunday, 7);
    for (const d of [0, 1, 2]) await sql(`insert into checkins (item_id, day, status, user_id) values ($1, $2, 'done', $3)`, [id, addDays(week2, d), home.users.owner]);
    app.pushes = [];
    await fireItemReminder(db(), id, review(week2), new Date(review(week2).getTime() + 1000));
    expect(app.pushes.find((p) => p.userId === home.users.owner)?.payload).toMatchObject({ title: "🏋️ 🏁 Gym: 1 of 2 weeks", body: "Not this time. What would make it work next time?" });
    const [after] = await sql<{ props: { _plan: PlanSpec }; remind_at: unknown }>(`select props, remind_at from items where id = $1`, [id]);
    expect([after.props._plan.result, after.remind_at]).toEqual(["broken", null]);
    expect(nextPlanReminder(after.props._plan, [], new Date(), TZ)).toBeNull();
  });

  it("moving a session updates the plan; only a card with Done checks a plan in", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set timezone = $2 where household_id = $1`, [home.householdId, TZ]);
    const sectionId = await planSpace(home.householdId);
    const today = todayKey(TZ);
    // Planned today only, so it can move to any later day of the week (if any is left).
    const spec = everyDay(today);
    spec.sessions[0].days = [new Date(`${today}T12:00:00Z`).getUTCDay()];
    const [{ id }] = await sql<{ id: string }>(`insert into items (section_id, title, props) values ($1, 'Gym', $2) returning id`, [sectionId, { _plan: spec }]);
    signIn(home.users.owner);
    const sat = addDays(weekOf(today), 6);
    if (today !== sat) {
      const moved = await P.movePlanSession(id, today, sat);
      expect(moved.ok && (moved.data.props._plan as PlanSpec).moves).toEqual([{ session: "s1", from: today, to: sat }]);
    }
    expect(await P.movePlanSession(id, today, addDays(today, 8))).toMatchObject({ ok: false });

    // A weekly-result card has no Done: marking it read logs nothing.
    const A = await import("./actions");
    const [run] = await sql<{ id: string }>(
      `insert into runs (user_id, household_id, item_id, title, body, icon, rendered, fired_at) values ($1, $2, $3, 'Week 1 kept', '', '🏋️', '[{"kind":"link","label":"x","href":"/"}]', now()) returning id`,
      [home.users.owner, home.householdId, id],
    );
    await A.markRun(run.id, true);
    expect(await sql(`select 1 from checkins where item_id = $1`, [id])).toEqual([]);
  });
});
