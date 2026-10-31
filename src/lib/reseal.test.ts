import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app, homeWith, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));

const { openToken, sealToken } = await import("./subs/gmail");
const { resealAll } = await import("./reseal");
const route = await import("@/app/api/cron/reseal/route");

beforeAll(startApp, 120_000);

const ORIGINAL = process.env.GOOGLE_TOKEN_KEY!;
const NEW = Buffer.alloc(32, 9).toString("base64");
afterEach(() => {
  process.env.GOOGLE_TOKEN_KEY = ORIGINAL;
  delete process.env.GOOGLE_TOKEN_KEY_PREVIOUS;
});

describe("rotating GOOGLE_TOKEN_KEY (roadmap 1.12)", () => {
  it("the old key keeps opening old tokens until they're re-sealed; then only the new key is needed", async () => {
    const home = await homeWith(["owner"]);
    const [{ id: section }] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Subs', 'subscriptions') returning id`, [home.householdId]);
    await sql(`insert into gmail_connections (section_id, user_id, refresh_token) values ($1, $2, $3)`, [section, home.users.owner, sealToken("gmail-refresh")]);
    await sql(`insert into calendar_connections (user_id, refresh_token) values ($1, $2)`, [home.users.owner, sealToken("cal-refresh")]);
    await sql(`insert into home_info (household_id, secrets) values ($1, $2)`, [home.householdId, sealToken("alarm 1234")]);
    const sealed = async () =>
      (await sql<{ v: string }>(
        `select refresh_token v from gmail_connections where section_id = $1 union all select refresh_token from calendar_connections where user_id = $2 union all select secrets from home_info where household_id = $3`,
        [section, home.users.owner, home.householdId],
      )).map((r) => r.v);

    // Step 1: new key in, old key kept as PREVIOUS. Old tokens still open.
    process.env.GOOGLE_TOKEN_KEY_PREVIOUS = ORIGINAL;
    process.env.GOOGLE_TOKEN_KEY = NEW;
    expect((await sealed()).map(openToken)).toEqual(["gmail-refresh", "cal-refresh", "alarm 1234"]);

    // Step 2: re-seal. This home's three rows move to the new key; a second run finds nothing to do.
    const first = await resealAll(testClient(app.db));
    expect(Object.values(first).every((c) => c.resealed >= 1 && c.unreadable === 0)).toBe(true);
    const second = await resealAll(testClient(app.db));
    expect(Object.values(second).map((c) => c.resealed)).toEqual([0, 0, 0]);

    // Step 3: PREVIOUS removed. Everything still opens.
    delete process.env.GOOGLE_TOKEN_KEY_PREVIOUS;
    expect((await sealed()).map(openToken)).toEqual(["gmail-refresh", "cal-refresh", "alarm 1234"]);
  });

  it("without the old key, an old token doesn't open", () => {
    const old = sealToken("x");
    process.env.GOOGLE_TOKEN_KEY = NEW;
    expect(() => openToken(old)).toThrow();
  });

  it("the endpoint needs the cron secret", async () => {
    process.env.CRON_SECRET = "cron-test";
    const call = (auth?: string) => route.POST(new Request("https://brain.test/api/cron/reseal", { method: "POST", headers: auth ? { authorization: auth } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    const res = await call("Bearer cron-test");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
