import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { app, homeWith, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";
import { getDict } from "@/i18n";

const webpush = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: webpush }));
const ssr = vi.hoisted(() => ({ claims: null as null | { sub: string }, setCookie: false }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (l: { name: string; value: string; options?: object }[]) => void } }) => ({
    auth: {
      getClaims: async () => {
        if (ssr.setCookie) opts.cookies.setAll([{ name: "sb-session", value: "refreshed" }]);
        return { data: ssr.claims ? { claims: ssr.claims } : null };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));

const { sendPush } = await import("./push");
const { sendEmail } = await import("./email");
const { loadWeek } = await import("./weekly");
const { middleware } = await import("@/middleware");
const confirm = await import("@/app/auth/confirm/route");
const { ACTION_META, CONDITION_META, describeTrigger, describeDays } = await import("./registry/automation");
const { SPACE_TYPES, spaceType } = await import("./registry/spaces");

beforeAll(startApp, 120_000);
beforeEach(() => {
  webpush.sendNotification.mockReset();
  app.respond = () => undefined;
});

describe("push delivery", () => {
  it("sends to every device with the badge count, and prunes dead subscriptions", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    const home = await homeWith(["owner"]);
    await sql(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/live', 'k', 'a'), ($1, 'https://push/dead', 'k', 'a')`, [home.users.owner]);
    await sql(`insert into runs (user_id, household_id, title) values ($1, $2, 'Waiting')`, [home.users.owner, home.householdId]);
    webpush.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("dead")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    expect(await sendPush(testClient(app.db), home.users.owner, { title: "Hi", body: "There", url: "/" })).toBe(1);
    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1])).toMatchObject({ title: "Hi", badge: 1 });
    expect(await sql(`select endpoint from push_subscriptions where user_id = $1`, [home.users.owner])).toEqual([{ endpoint: "https://push/live" }]);
  });
});

describe("email", () => {
  it("not set up says so; set up posts to Resend; a refusal is reported", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail("a@b.c", "S", "B")).toEqual({ ok: false, reason: "not_configured" });
    process.env.RESEND_API_KEY = "re_test";
    expect(await sendEmail("a@b.c", "S", "B")).toEqual({ ok: true });
    app.respond = () => new Response("bad address", { status: 422 });
    expect(await sendEmail("a@b.c", "S", "B")).toMatchObject({ ok: false, reason: "failed", detail: "422 bad address" });
    delete process.env.RESEND_API_KEY;
  });
});

describe("weekly page", () => {
  it("adds up the week: sessions done, money vs the week before, what's coming, open requests", async () => {
    const home = await homeWith(["owner", "adult"]);
    const db = testClient(app.db);
    const [{ id: tracker }] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Gym', 'tracker') returning id`, [home.householdId]);
    const [{ id: spend }] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Spend', 'spend') returning id`, [home.householdId]);
    const [{ id: gym }] = await sql<{ id: string }>(`insert into items (section_id, title) values ($1, 'Workout') returning id`, [tracker]);
    await sql(`insert into checkins (item_id, day, user_id) values ($1, current_date, $2), ($1, current_date - 1, $2)`, [gym, home.users.owner]);
    const tx = (amount: number, daysAgo: number) => ({ _tx: { amount, currency: "₪", at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), category: "groceries", merchant: "x", key: `k${amount}`, card: "1", refund: false } });
    await sql(`insert into items (section_id, title, props) values ($1, 'a', $2), ($1, 'b', $3)`, [spend, tx(100, 2), tx(40, 9)]);
    await sql(`insert into items (section_id, title, due_at) values ($1, 'Vet', now() + interval '2 days')`, [tracker]);
    await sql(`insert into requests (household_id, from_user, to_user, text) values ($1, $2, $3, 'Fix tap')`, [home.householdId, home.users.owner, home.users.adult]);
    const week = await loadWeek(db, home.householdId);
    expect(week.sessions).toEqual([{ title: "Workout", done: 2 }]);
    expect([week.spent, week.spentBefore]).toEqual([100, 40]);
    expect(week.coming.map((c) => c.title)).toEqual(["Vet"]);
    expect(week.requests).toEqual([{ text: "Fix tap", from_user: home.users.owner, to_user: home.users.adult }]);
    expect(week.done.reduce((n, d) => n + d.count, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe("middleware", () => {
  const go = (path: string) => middleware(new NextRequest(`https://brain.test${path}`));
  it("signed out: app pages go to /login, public ones don't", async () => {
    ssr.claims = null;
    expect((await go("/sections")).headers.get("location")).toBe("https://brain.test/login");
    for (const p of ["/login", "/privacy", "/join/abc", "/g/abc", "/api/health", "/sw.js"]) expect((await go(p)).headers.get("location")).toBeNull();
  });
  it("signed in: through, with a refreshed session cookie passed on", async () => {
    ssr.claims = { sub: "u1" };
    ssr.setCookie = true;
    const res = await go("/sections");
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("sb-session")?.value).toBe("refreshed");
    ssr.setCookie = false;
  });
  it("an auth email that lands on /?code= finishes at /auth/confirm", async () => {
    expect((await go("/?code=xyz")).headers.get("location")).toBe("https://brain.test/auth/confirm?code=xyz");
  });
});

describe("auth email links", () => {
  it("a missing code goes back to login with the reason", async () => {
    const res = await confirm.GET(new Request("https://brain.test/auth/confirm"));
    expect(res.headers.get("location")).toBe("https://brain.test/login?error=Missing+code");
  });
});

describe("registries", () => {
  const t = getDict("en");
  it("every action and condition type starts the editor with its own kind; conditions are valid as they are", async () => {
    const { conditionSchema } = await import("./engine/types");
    for (const [type, meta] of Object.entries(ACTION_META)) expect(meta.make().type).toBe(type);
    for (const meta of Object.values(CONDITION_META)) expect(conditionSchema.safeParse(meta.make()).success).toBe(true);
  });
  it("describes triggers in plain words", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6], t)).toBe("✱");
    expect(describeTrigger({ type: "schedule", days: [1, 0], times: ["20:00", "08:00"] }, t)).toBe(`🗓️ ${t.weekdaysShort[0]} ${t.weekdaysShort[1]} · 08:00, 20:00`);
    expect(describeTrigger({ type: "event", event: "wake", delayMinutes: 10 }, t)).toContain("+10");
  });
  it("every space type has its behaviour, and unknown views fall back", () => {
    for (const s of Object.values(SPACE_TYPES)) expect(typeof s.addPlaceholder(t)).toBe("string");
    expect(spaceType("nope" as never).quickAdd).toBe(true);
    expect(spaceType("spend").quickAdd).toBe(false);
  });
});
