import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { app, homeWith, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (fn: () => unknown) => void fn() }));

process.env.NEXT_PUBLIC_APP_URL = "https://brain.test";
const { signState, sealToken, GMAIL_SCOPE } = await import("@/lib/subs/gmail");
const { CALENDAR_SCOPE, CALENDAR_STATE } = await import("@/lib/gcal");
const { scanDueGmail, scanGmail } = await import("@/lib/subs/scan");
const connect = await import("./connect/route");
const callback = await import("./callback/route");
const scan = await import("./scan/route");
const calendar = await import("./calendar/route");
const cron = await import("../cron/gmail/route");
const A = await import("@/app/actions");

beforeAll(startApp, 120_000);

/** A pretend Google: OAuth, one Netflix receipt in Gmail, and Calendar. */
let google: { scope: string; tokenError?: string; calendarEvents: unknown[] };
beforeEach(() => {
  google = { scope: GMAIL_SCOPE, calendarEvents: [] };
  app.pushes = [];
  app.outbound = [];
  app.respond = (url) => {
    if (url.startsWith("https://oauth2.googleapis.com/token"))
      return google.tokenError ? new Response(JSON.stringify({ error: google.tokenError }), { status: 400 }) : { access_token: "access", refresh_token: "refresh", scope: google.scope };
    if (url.endsWith("/users/me/profile")) return { emailAddress: "niv@gmail.com" };
    if (url.includes("/users/me/messages?")) return { messages: [{ id: "m1" }] };
    if (url.includes("/users/me/messages/m1")) {
      const body = Buffer.from("Your monthly plan: Standard\nTotal: 54.90 ₪").toString("base64url");
      return {
        id: "m1",
        internalDate: String(Date.parse("2026-10-10T08:00:00Z")),
        payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Netflix <info@account.netflix.com>" }, { name: "Subject", value: "Your payment was received" }], body: { data: body } },
      };
    }
    if (url.includes("/calendars/primary/events")) return { id: "evt-1" };
    if (url.endsWith("/calendars/primary")) return { id: "niv@gmail.com" };
    return undefined;
  };
});

async function subsSpace(householdId: string, owner?: string) {
  const [{ id }] = await sql<{ id: string }>(`insert into sections (household_id, title, view, owner_id) values ($1, 'Subscriptions', 'subscriptions', $2) returning id`, [householdId, owner ?? null]);
  return id;
}
const get = (path: string) => new NextRequest(`https://brain.test${path}`);
const location = (res: Response) => res.headers.get("location");

describe("connect Gmail", () => {
  it("sends you to Google with a signed state for your own space only", async () => {
    const home = await homeWith(["owner", "adult"]);
    const mine = await subsSpace(home.householdId);
    const theirs = await subsSpace(home.householdId, home.users.adult);
    expect(location(await connect.GET(get(`/api/google/connect?section=${mine}`)))).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(location(await connect.GET(get(`/api/google/connect?section=${theirs}`)))).toBe("https://brain.test/sections");
  });

  it("the callback stores the sealed token, names the space, scans and finds Netflix", async () => {
    const home = await homeWith(["owner"]);
    const s = await subsSpace(home.householdId);
    const res = await callback.GET(get(`/api/google/callback?code=abc&state=${signState(home.users.owner, s)}`));
    expect(location(res)).toBe(`https://brain.test/sections/${s}?gmail=connected`);
    const [conn] = await sql<{ email: string; refresh_token: string }>(`select email, refresh_token from gmail_connections where section_id = $1`, [s]);
    expect(conn.email).toBe("niv@gmail.com");
    expect(conn.refresh_token).not.toContain("refresh");
    expect(await sql(`select title from sections where id = $1`, [s])).toEqual([{ title: "Subscriptions · niv" }]);
    expect(await sql(`select title from items where section_id = $1`, [s])).toEqual([{ title: "Netflix" }]);
  });

  it("refuses someone else's state, a cancelled consent, or a missing read scope", async () => {
    const home = await homeWith(["owner", "adult"]);
    const s = await subsSpace(home.householdId);
    expect(location(await callback.GET(get(`/api/google/callback?code=abc&state=${signState(home.users.adult, s)}`)))).toContain("gmail=failed");
    expect(location(await callback.GET(get(`/api/google/callback?error=access_denied&state=${signState(home.users.owner, s)}`)))).toContain("gmail=cancelled");
    google.scope = "email";
    expect(location(await callback.GET(get(`/api/google/callback?code=abc&state=${signState(home.users.owner, s)}`)))).toContain("gmail=noscope");
    expect(await sql(`select 1 from gmail_connections where section_id = $1`, [s])).toEqual([]);
  });
});

describe("scanning", () => {
  it("scan now finds receipts; the 30-minute cron scans one due inbox and pushes what's new", async () => {
    const home = await homeWith(["owner"]);
    const s = await subsSpace(home.householdId);
    await sql(`insert into gmail_connections (section_id, user_id, email, refresh_token) values ($1, $2, 'niv@gmail.com', $3)`, [s, home.users.owner, sealToken("refresh")]);
    expect(await (await scan.POST(new Request("https://brain.test/api/google/scan", { method: "POST", body: JSON.stringify({ sectionId: s }) }))).json()).toEqual({ ok: true, started: true });
    await vi.waitFor(async () => expect(await sql(`select title from items where section_id = $1`, [s])).toEqual([{ title: "Netflix" }]));
    expect(await (await scan.GET(new Request(`https://brain.test/api/google/scan?sectionId=${s}`))).json()).toMatchObject({ ok: true, status: "ok", failed: false });

    await sql(`update gmail_connections set last_scan_at = now() - interval '2 days' where section_id = $1`, [s]);
    await sql(`delete from items where section_id = $1`, [s]);
    process.env.CRON_SECRET = "cron-test-secret";
    expect((await cron.POST(new Request("https://brain.test/api/cron/gmail", { method: "POST" }))).status).toBe(401);
    const res = await cron.POST(new Request("https://brain.test/api/cron/gmail", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }));
    expect(await res.json()).toMatchObject({ ok: true, result: { ok: true, added: 1 } });
    expect(app.pushes.map((p) => p.userId)).toEqual([home.users.owner]);
    // Just scanned: nothing else is due.
    expect(await scanDueGmail(testClient(app.db))).toBeNull();
  });

  it("an expired Google grant marks the inbox expired", async () => {
    const home = await homeWith(["owner"]);
    const s = await subsSpace(home.householdId);
    await sql(`insert into gmail_connections (section_id, user_id, email, refresh_token) values ($1, $2, 'niv@gmail.com', $3)`, [s, home.users.owner, sealToken("refresh")]);
    google.tokenError = "invalid_grant";
    expect(await scanGmail(testClient(app.db), s)).toEqual({ ok: false, error: "expired" });
    expect(await sql(`select status from gmail_connections where section_id = $1`, [s])).toEqual([{ status: "expired" }]);
  });
});

describe("Google Calendar", () => {
  it("connects from Me, then writes and moves a dated item's event", async () => {
    const home = await homeWith(["owner"]);
    expect(location(await calendar.GET())).toMatch(/accounts\.google\.com/);
    google.scope = CALENDAR_SCOPE;
    expect(location(await callback.GET(get(`/api/google/callback?code=abc&state=${signState(home.users.owner, CALENDAR_STATE)}`)))).toBe("https://brain.test/me?calendar=connected");
    const [{ id: s }] = await sql<{ id: string }>(`insert into sections (household_id, title) values ($1, 'Health') returning id`, [home.householdId]);
    const [{ id }] = await sql<{ id: string }>(`insert into items (section_id, title, due_at) values ($1, 'Dentist', '2026-11-03T08:00:00Z') returning id`, [s]);
    expect(await A.syncItemToCalendar(id)).toEqual({ ok: true });
    expect(await sql(`select gcal_event_id from items where id = $1`, [id])).toEqual([{ gcal_event_id: "evt-1" }]);
    await sql(`update items set due_at = null where id = $1`, [id]);
    expect(await A.syncItemToCalendar(id)).toEqual({ ok: true });
    expect(await sql(`select gcal_event_id from items where id = $1`, [id])).toEqual([{ gcal_event_id: null }]);
  });
});
