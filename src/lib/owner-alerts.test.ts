import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app, homeWith, signIn, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";
import { zonedTimeToUtc } from "@/lib/engine/time";
import { silenceAlert, tickAlert, weekStats } from "./owner-report";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { ownerChecks } = await import("./owner-alerts");
const tick = await import("@/app/api/engine/tick/route");
const A = await import("@/app/actions");

/** Emails that went to Resend in this test. */
let sent: { to: string[]; subject: string; text: string }[] = [];
beforeAll(async () => {
  await startApp();
  const fake = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith("https://api.resend.com/")) {
      sent.push(JSON.parse(String(init!.body)));
      return new Response("{}", { status: 200 });
    }
    return fake(url, init);
  });
}, 120_000);
beforeEach(() => {
  sent = [];
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("SIGNUP_ALERT_EMAIL", "owner@example.com");
  process.env.CRON_SECRET = "cron-test-secret";
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const at = (iso: string) => new Date(iso);

describe("engine emails, as words", () => {
  const ok = { last_tick_at: "2026-11-01T08:00:00Z", failed_phases: [] };

  it("a failed phase or a gap the engine came back from; at most one an hour", () => {
    expect(tickAlert(ok, [], at("2026-11-01T08:01:00Z"))).toBeNull();
    expect(tickAlert(ok, [{ phase: "daily", error: "Error: boom" }], at("2026-11-01T08:01:00Z"))).toMatchObject({ subject: "Home Brain: daily failed", body: expect.stringContaining("- daily: Error: boom") });
    expect(tickAlert(ok, [], at("2026-11-01T08:20:00Z"))).toMatchObject({ subject: "Home Brain: the engine was down and is back", body: expect.stringContaining("silent for 20 minutes") });
    const alerted = { ...ok, alerted_at: "2026-11-01T07:30:00Z" };
    expect(tickAlert(alerted, [{ phase: "daily" }], at("2026-11-01T08:01:00Z"))).toBeNull();
    expect(tickAlert(alerted, [{ phase: "daily" }], at("2026-11-01T08:31:00Z"))).not.toBeNull();
  });

  it("from outside the tick: silence over 5 minutes", () => {
    expect(silenceAlert(ok, at("2026-11-01T08:04:00Z"))).toBeNull();
    expect(silenceAlert(ok, at("2026-11-01T08:30:00Z"))).toMatchObject({ subject: "Home Brain: the engine isn't running", body: expect.stringContaining("30 minutes") });
    expect(silenceAlert(null, at("2026-11-01T08:30:00Z"))).not.toBeNull();
  });

  it("the week: new homes, who ticked on day one, who's active, finder goals", () => {
    const now = at("2026-11-08T08:00:00Z");
    const stats = weekStats({
      now,
      homes: [
        { id: "old", created_at: "2026-09-01T00:00:00Z" },
        { id: "keen", created_at: "2026-11-03T10:00:00Z" },
        { id: "gone", created_at: "2026-11-04T10:00:00Z" },
      ],
      members: [
        { user_id: "a", household_id: "old" },
        { user_id: "k", household_id: "keen" },
        { user_id: "g", household_id: "gone" },
      ],
      ticks: [
        { user_id: "k", at: "2026-11-03T20:00:00Z" },
        { user_id: "g", at: "2026-11-07T10:00:00Z" },
        { user_id: null, household_id: "old", at: "2026-10-20T10:00:00Z" },
      ],
      finder: [["money", "dog"], ["money"]],
    });
    expect(stats).toEqual({ homes: 3, newHomes: 2, newHomesTicked: 1, activeHomes: 2, goals: [["money", 2], ["dog", 1]] });
  });
});

describe("emails to the owner", () => {
  it("a tick after a silence emails once; the next tick within the hour doesn't", async () => {
    await sql(`insert into engine_status (id, last_tick_at) values (true, now() - interval '20 minutes') on conflict (id) do update set last_tick_at = excluded.last_tick_at, alerted_at = null`);
    const run = () => tick.POST(new Request("https://brain.test/api/engine/tick", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }));
    await run();
    expect(sent.map((m) => m.subject)).toEqual(["Home Brain: the engine was down and is back"]);
    expect(sent[0].to).toEqual(["owner@example.com"]);
    await sql(`update engine_status set last_tick_at = now() - interval '20 minutes'`);
    await run();
    expect(sent).toHaveLength(1);
  });

  it("the Sunday report goes out once, after 09:00 Israel time", async () => {
    const home = await homeWith(["owner"]);
    const [{ id: section }] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Walks', 'tracker') returning id`, [home.householdId]);
    const [{ id: item }] = await sql<{ id: string }>(`insert into items (section_id, title) values ($1, 'Walk') returning id`, [section]);
    await sql(`insert into checkins (item_id, user_id, day) values ($1, $2, current_date)`, [item, home.users.owner]);
    await sql(`insert into events (user_id, type, payload) values ($1, 'finder', '{"goals": ["dog", "money"]}')`, [home.users.owner]);
    await sql(`insert into engine_status (id, last_tick_at) values (true, now()) on conflict (id) do update set last_tick_at = now(), weekly_report_on = null, alerted_at = null`);
    const db = testClient(app.db);
    // This week's Sunday: 08:30 is too early, 10:00 sends, a second run that day doesn't.
    const sunday = new Date();
    sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
    const israel = (h: number, m = 0) => zonedTimeToUtc(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), h, m, "Asia/Jerusalem");
    const check = async (when: Date) => {
      // The engine ran a minute before, so only the report is in question.
      await sql(`update engine_status set last_tick_at = $1`, [new Date(when.getTime() - 60_000).toISOString()]);
      return ownerChecks(db, when);
    };
    expect(await check(israel(8, 30))).toEqual({ silent: false, weekly: false });
    expect(await check(israel(10))).toEqual({ silent: false, weekly: true });
    expect(await check(israel(10, 30))).toEqual({ silent: false, weekly: false });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/^Home Brain this week: \d+ new, \d+ of \d+ homes active$/);
    expect(sent[0].text).toContain("dog ×1");
    expect(sent[0].text).toContain("money ×1");
  });

  it("feedback from Me reaches the owner with who sent it", async () => {
    const home = await homeWith(["owner"]);
    signIn(home.users.owner);
    expect(await A.sendFeedback("hi")).toEqual({ ok: false, error: "too short" });
    expect(await A.sendFeedback("The dog page could show the last walk")).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["owner@example.com"]);
    expect(sent[0].text).toMatch(/^The dog page could show the last walk\n\n— /);
  });
});
