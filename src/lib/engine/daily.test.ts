import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app, homeWith, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";

vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { dailyJobs, sendBriefing, sendStoreList } = await import("./daily");
const db = () => testClient(app.db);

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.pushes = [];
  app.respond = () => undefined;
});

/** A moment on the Jerusalem clock in November 2026 (UTC+2). */
const at = (day: string, time: string) => new Date(`${day}T${time}:00+02:00`);
/** "Sent today" marks carry the database clock; move them to the test's clock. */
const settle = (userId: string, when: Date) => sql(`update events set created_at = $2 where user_id = $1`, [userId, when.toISOString()]);
const pushesTo = (userId: string) => app.pushes.filter((p) => p.userId === userId).map((p) => p.payload);

/** Hebcal for the week of 6 Nov 2026: candles Friday 16:20, havdalah Saturday 17:20. */
const shabbat = (url: string) =>
  url.includes("hebcal.com")
    ? {
        items: [
          { title: "Candle lighting: 16:20", date: "2026-11-06T16:20:00+02:00", category: "candles" },
          { title: "Havdalah: 17:20", date: "2026-11-07T17:20:00+02:00", category: "havdalah" },
        ],
      }
    : undefined;

async function space(householdId: string, fields: Record<string, unknown>) {
  const { data, error } = await db().from("sections").insert({ household_id: householdId, title: "Space", ...fields }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

describe("morning briefing", () => {
  it("goes out at the 09:30 fallback once, with what's open today", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set display_name = 'Niv', wrapup = false where user_id = $1`, [home.users.owner]);
    const s = await space(home.householdId, {});
    await sql(`insert into items (section_id, title, due_at) values ($1, 'Pay arnona', $2)`, [s, at("2026-11-02", "12:00").toISOString()]);
    const sent = await dailyJobs(db(), at("2026-11-02", "09:35"));
    expect(sent).toContain(`briefing:${home.users.owner}`);
    const [briefing] = pushesTo(home.users.owner);
    expect(briefing.title).toContain("Niv");
    expect(briefing.body).toContain("Pay arnona");
    await settle(home.users.owner, at("2026-11-02", "09:35"));
    await dailyJobs(db(), at("2026-11-02", "09:40"));
    expect(pushesTo(home.users.owner)).toHaveLength(1);
  });

  it("stays quiet on Shabbat for those who asked, and when turned off", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set quiet_shabbat = true where user_id = $1`, [home.users.owner]);
    app.respond = shabbat;
    expect(await sendBriefing(db(), home.users.owner, at("2026-11-07", "10:00"))).toBe(false);
    await sql(`update profiles set quiet_shabbat = false, briefing = false where user_id = $1`, [home.users.owner]);
    expect(await sendBriefing(db(), home.users.owner, at("2026-11-07", "10:00"))).toBe(false);
  });
});

describe("evening wrap-up", () => {
  it("at wrap-up time, tells you how the day went, once", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set briefing = false, wrapup_time = '21:00' where user_id = $1`, [home.users.owner]);
    const s = await space(home.householdId, {});
    await sql(`insert into items (section_id, title, due_at) values ($1, 'Call mom', $2)`, [s, at("2026-11-03", "12:00").toISOString()]);
    expect(await dailyJobs(db(), at("2026-11-03", "21:05"))).toContain(`wrapup:${home.users.owner}`);
    expect(pushesTo(home.users.owner).map((p) => p.url)).toEqual(["/wrapup"]);
    await settle(home.users.owner, at("2026-11-03", "21:05"));
    expect(await dailyJobs(db(), at("2026-11-03", "21:10"))).not.toContain(`wrapup:${home.users.owner}`);
  });
});

describe("Shabbat shopping", () => {
  it("on erev Shabbat morning, counts what's left on the list", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set briefing = false, wrapup = false, shabbat_shop = true where user_id = $1`, [home.users.owner]);
    const list = await space(home.householdId, { template: "groceries", view: "checklist" });
    await sql(`insert into items (section_id, title) values ($1, 'Challah'), ($1, 'Wine')`, [list]);
    app.respond = shabbat;
    expect(await dailyJobs(db(), at("2026-11-05", "09:05"))).not.toContain(`shop:${home.users.owner}`);
    expect(await dailyJobs(db(), at("2026-11-06", "09:05"))).toContain(`shop:${home.users.owner}`);
    expect(pushesTo(home.users.owner)[0].body).toMatch(/2/);
  });
});

describe("at the supermarket", () => {
  it("sends the open list once per visit, and nothing for an empty list", async () => {
    const home = await homeWith(["owner"]);
    const list = await space(home.householdId, { template: "groceries", view: "checklist" });
    expect(await sendStoreList(db(), home.users.owner)).toBe(false);
    await sql(`insert into items (section_id, title, position) values ($1, 'Eggs', 1), ($1, 'Bread', 2)`, [list]);
    expect(await sendStoreList(db(), home.users.owner)).toBe(true);
    expect(pushesTo(home.users.owner)[0].body).toBe("Eggs, Bread");
    await sql(`insert into events (user_id, type) values ($1, 'arrive_store')`, [home.users.owner]);
    expect(await sendStoreList(db(), home.users.owner)).toBe(false);
  });
});

describe("pets, documents, money, weekly", () => {
  it("dog food: one heads-up per bag, to everyone at home, in the daytime", async () => {
    const home = await homeWith(["owner", "adult"]);
    await sql(`update profiles set briefing = false, wrapup = false where household_id = $1`, [home.householdId]);
    const [{ id }] = await sql<{ id: string }>(`insert into pets (household_id, name, emoji, food_bag_kg, daily_grams, bag_started) values ($1, 'Rex', '🐶', 12, 300, '2026-10-01') returning id`, [home.householdId]);
    expect(await dailyJobs(db(), at("2026-11-06", "07:00"))).not.toContain(`food:${id}`);
    expect(await dailyJobs(db(), at("2026-11-06", "10:00"))).toContain(`food:${id}`);
    expect(app.pushes.filter((p) => p.payload.url === `/pets/${id}`).map((p) => p.userId).sort()).toEqual([home.users.owner, home.users.adult].sort());
    expect(await dailyJobs(db(), at("2026-11-06", "11:00"))).not.toContain(`food:${id}`);
  });

  it("documents: 60/30/7-day heads-ups, each once", async () => {
    const home = await homeWith(["owner"]);
    const docs = await space(home.householdId, { template: "documents", schema: [{ id: "expires", name: "Expires", type: "date" }] });
    const [{ id }] = await sql<{ id: string }>(`insert into items (section_id, title, props) values ($1, 'Passport', '{"expires":"2026-12-01"}') returning id`, [docs]);
    expect(await dailyJobs(db(), at("2026-11-02", "10:00"))).toContain(`expiry:${id}:30`);
    expect(await dailyJobs(db(), at("2026-11-03", "10:00"))).not.toContain(`expiry:${id}:30`);
    expect(await dailyJobs(db(), at("2026-11-25", "10:00"))).toContain(`expiry:${id}:7`);
  });

  it("month end: where the money went, on the last evening", async () => {
    const home = await homeWith(["owner"]);
    const spend = await space(home.householdId, { view: "spend" });
    const tx = { amount: 250, currency: "₪", at: "2026-11-15T10:00:00Z", category: "groceries", merchant: "Shufersal", key: "k1", card: "1234", refund: false };
    await sql(`insert into items (section_id, title, props, created_at) values ($1, 'Shufersal', $2, '2026-11-15T10:00:00Z')`, [spend, { _tx: tx }]);
    expect(await dailyJobs(db(), at("2026-11-29", "20:05"))).not.toContain(`money:${home.users.owner}`);
    expect(await dailyJobs(db(), at("2026-11-30", "20:05"))).toContain(`money:${home.users.owner}`);
    expect(pushesTo(home.users.owner).find((p) => p.url === "/money")?.title).toContain("₪250");
  });

  it("weekly check-in: Sunday 20:00, once", async () => {
    const home = await homeWith(["owner"]);
    expect(await dailyJobs(db(), at("2026-11-08", "20:05"))).toContain(`weekly:${home.users.owner}`);
    await settle(home.users.owner, at("2026-11-08", "20:05"));
    expect(await dailyJobs(db(), at("2026-11-08", "20:10"))).not.toContain(`weekly:${home.users.owner}`);
    expect(await dailyJobs(db(), at("2026-11-09", "20:05"))).not.toContain(`weekly:${home.users.owner}`);
  });
});
