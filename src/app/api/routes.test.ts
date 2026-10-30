import { beforeAll, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { app, homeWith, signIn, sql, startApp } from "@/test/app";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { hashKey, newKey } = await import("@/lib/hook-keys");
const capture = await import("./hooks/capture/route");
const checkin = await import("./hooks/checkin/route");
const event = await import("./hooks/event/route");
const spend = await import("./hooks/spend/route");
const tick = await import("./engine/tick/route");
const health = await import("./health/route");
const cal = await import("./cal/[token]/route");
const ics = await import("./ics/route");
const exportRoute = await import("./export/route");

beforeAll(startApp, 120_000);

let ip = 0;
/** Each call from its own address, so the per-IP limit doesn't leak between tests. */
const post = (path: string, key: string | null, body?: unknown) =>
  new Request(`https://brain.test${path}`, {
    method: "POST",
    headers: { ...(key ? { "x-brain-token": key } : {}), "content-type": "application/json", "x-forwarded-for": `198.51.100.${++ip % 250}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function keyFor(userId: string, purpose: string) {
  const key = newKey();
  await sql(`insert into hook_keys (user_id, purpose, key_hash) values ($1, $2, $3)`, [userId, purpose, hashKey(key)]);
  return key;
}
async function space(householdId: string, fields: Record<string, unknown> = {}) {
  const cols = { title: "Space", ...fields };
  const keys = Object.keys(cols);
  const [{ id }] = await sql<{ id: string }>(
    `insert into sections (household_id${keys.map((k) => `, ${k}`).join("")}) values ($1${keys.map((_, i) => `, $${i + 2}`).join("")}) returning id`,
    [householdId, ...keys.map((k) => cols[k as keyof typeof cols])],
  );
  return id;
}

describe("Siri capture", () => {
  it("adds to the named list and says where it went", async () => {
    const home = await homeWith(["owner"]);
    const list = await space(home.householdId, { title: "Groceries", template: "groceries", view: "checklist" });
    const key = await keyFor(home.users.owner, "capture");
    const res = await capture.POST(post("/api/hooks/capture", key, { text: "milk", space: "Groceries" }));
    expect(await res.json()).toMatchObject({ ok: true, space: "Groceries" });
    expect(await sql(`select title from items where section_id = $1`, [list])).toEqual([{ title: "milk" }]);
  });

  it("rejects a missing, wrong, revoked or other-purpose key, and empty text", async () => {
    const home = await homeWith(["owner"]);
    await space(home.householdId, { title: "List", view: "checklist" });
    const eventKey = await keyFor(home.users.owner, "event");
    expect((await capture.POST(post("/api/hooks/capture", null, { text: "x" }))).status).toBe(401);
    expect((await capture.POST(post("/api/hooks/capture", "f".repeat(43), { text: "x" }))).status).toBe(401);
    expect((await capture.POST(post("/api/hooks/capture", eventKey, { text: "x" }))).status).toBe(401);
    const key = await keyFor(home.users.owner, "capture");
    expect((await capture.POST(post("/api/hooks/capture", key, { text: "  " }))).status).toBe(400);
    await sql(`update hook_keys set revoked_at = now() where key_hash = $1`, [hashKey(key)]);
    expect((await capture.POST(post("/api/hooks/capture", key, { text: "x" }))).status).toBe(401);
  });

  it("never adds to someone else's private list", async () => {
    const home = await homeWith(["owner", "adult"]);
    const theirs = await space(home.householdId, { title: "Secret", view: "checklist", owner_id: home.users.adult });
    const key = await keyFor(home.users.owner, "capture");
    await capture.POST(post("/api/hooks/capture", key, { text: "peek", space: theirs }));
    expect(await sql(`select title from items where section_id = $1`, [theirs])).toEqual([]);
  });
});

describe("Shortcut check-in", () => {
  it("checks in today and reports the streak; other homes' items are not found", async () => {
    const home = await homeWith(["owner"]);
    const other = await homeWith(["owner"]);
    const tracker = await space(home.householdId, { view: "tracker" });
    const theirs = await space(other.householdId, { view: "tracker" });
    const [{ id: meds }] = await sql<{ id: string }>(`insert into items (section_id, title) values ($1, 'Meds') returning id`, [tracker]);
    const [{ id: foreign }] = await sql<{ id: string }>(`insert into items (section_id, title) values ($1, 'Theirs') returning id`, [theirs]);
    const key = await keyFor(home.users.owner, "checkin");
    const res = await checkin.POST(post(`/api/hooks/checkin?item=${meds}`, key));
    expect(await res.json()).toMatchObject({ ok: true, message: "✓ Meds" });
    expect(await sql(`select status from checkins where item_id = $1`, [meds])).toEqual([{ status: "done" }]);
    expect((await checkin.POST(post(`/api/hooks/checkin?item=${foreign}`, key))).status).toBe(404);
    expect((await checkin.POST(post(`/api/hooks/checkin`, key))).status).toBe(400);
  });
});

describe("Shortcut events", () => {
  it("fires automations for the event; unknown types are refused", async () => {
    const home = await homeWith(["owner"]);
    await sql(
      `insert into automations (household_id, owner_id, target_user_id, name, trigger, actions, enabled) values ($1, $2, $2, 'Home', '{"type":"event","event":"arrive_home","delayMinutes":0}', '[{"type":"push","title":"Welcome","body":"home"}]', true)`,
      [home.householdId, home.users.owner],
    );
    const key = await keyFor(home.users.owner, "event");
    expect(await (await event.POST(post("/api/hooks/event?type=arrive_home", key))).json()).toMatchObject({ ok: true, fired: 1 });
    expect((await event.POST(post("/api/hooks/event?type=party", key))).status).toBe(400);
    expect(await sql(`select type from events where user_id = $1`, [home.users.owner])).toEqual([{ type: "arrive_home" }]);
  });
});

describe("purchase texts", () => {
  const sms = 'מקס: בכרטיסך המסתיים ב-1234 אושרה עסקה בסך 84.90 ש"ח בשופרסל דיל.';

  it("records a purchase once, pushes it, and ignores texts that aren't purchases", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId, { view: "spend", icon: "💳" });
    const key = await keyFor(home.users.owner, "spend");
    app.pushes = [];
    expect(await (await spend.POST(post("/api/hooks/spend", key, { text: sms }))).json()).toMatchObject({ ok: true, amount: 84.9, merchant: "שופרסל דיל" });
    expect(await (await spend.POST(post("/api/hooks/spend", key, { text: sms }))).json()).toMatchObject({ ok: true, duplicate: true });
    expect(await (await spend.POST(post("/api/hooks/spend", key, { text: "Your code is 123456" }))).json()).toMatchObject({ ok: true, ignored: true });
    expect(await sql(`select title from items where section_id = $1`, [s])).toEqual([{ title: "שופרסל דיל" }]);
    expect(app.pushes.map((p) => p.payload.title)).toEqual(["💳 ₪84.9 · שופרסל דיל"]);
  });

  it("says so when there's no Spending space", async () => {
    const home = await homeWith(["owner"]);
    const key = await keyFor(home.users.owner, "spend");
    expect((await spend.POST(post("/api/hooks/spend", key, { text: sms }))).status).toBe(404);
  });
});

describe("rate limits on hooks", () => {
  it("one key hammering the hook gets 429", async () => {
    const home = await homeWith(["owner"]);
    await space(home.householdId, { title: "List", view: "checklist" });
    const key = await keyFor(home.users.owner, "capture");
    const statuses: number[] = [];
    for (let i = 0; i < 70; i++) statuses.push((await capture.POST(post("/api/hooks/capture", key, { text: `x${i}` }))).status);
    expect(statuses).toContain(429);
  });
});

describe("engine tick and health", () => {
  it("only pg_cron's secret may tick; a tick writes the heartbeat health reads", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    expect((await tick.POST(new Request("https://brain.test/api/engine/tick", { method: "POST" }))).status).toBe(401);
    const res = await tick.POST(new Request("https://brain.test/api/engine/tick", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }));
    expect(await res.json()).toMatchObject({ ok: true });
    const h = await health.GET();
    expect(h.status).toBe(200);
    await sql(`update engine_status set last_tick_at = now() - interval '10 minutes'`);
    expect((await health.GET()).status).toBe(503);
  });
});

describe("calendar feeds", () => {
  it("the private feed lists open dated items you can see, by token", async () => {
    const home = await homeWith(["owner", "adult"]);
    const shared = await space(home.householdId, { icon: "🦷" });
    const theirs = await space(home.householdId, { owner_id: home.users.adult });
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    await sql(`insert into items (section_id, title, due_at) values ($1, 'Dentist', $3), ($2, 'Their secret', $3), ($1, 'Done one', $3)`, [shared, theirs, soon]);
    await sql(`update items set done = true where title = 'Done one'`);
    const [{ ics_token }] = await sql<{ ics_token: string }>(`select ics_token from profiles where user_id = $1`, [home.users.owner]);
    const body = await (await cal.GET(new Request(`https://brain.test/api/cal/${ics_token}.ics`), { params: Promise.resolve({ token: `${ics_token}.ics` }) })).text();
    expect(body).toContain("Dentist");
    expect(body).not.toContain("Their secret");
    expect(body).not.toContain("Done one");
    expect((await cal.GET(new Request("https://brain.test/api/cal/nope.ics"), { params: Promise.resolve({ token: "nope.ics" }) })).status).toBe(404);
  });

  it("the one-off .ics download needs sign-in and real dates", async () => {
    signIn(null);
    expect((await ics.GET(new Request("https://brain.test/api/ics?title=x&start=2026-01-01&end=2026-01-02"))).status).toBe(401);
    await homeWith(["owner"]);
    expect((await ics.GET(new Request("https://brain.test/api/ics?title=x&start=nope&end=2026-01-02"))).status).toBe(400);
    const ok = await ics.GET(new Request("https://brain.test/api/ics?title=Party&start=2026-01-01T18:00:00Z&end=2026-01-01T20:00:00Z"));
    expect(await ok.text()).toContain("SUMMARY:Party");
  });
});

describe("export my data", () => {
  it("zips what you can see, without anyone's private space or any token", async () => {
    const home = await homeWith(["owner", "adult"]);
    const shared = await space(home.householdId, { title: "Shared list" });
    const theirs = await space(home.householdId, { title: "Their diary", owner_id: home.users.adult });
    await sql(`insert into items (section_id, title) values ($1, 'Milk'), ($2, 'Private thought')`, [shared, theirs]);
    await sql(`insert into hook_keys (user_id, purpose, key_hash) values ($1, 'capture', 'hash-should-not-leak')`, [home.users.owner]);
    signIn(home.users.owner);
    const res = await exportRoute.GET();
    expect(res.headers.get("content-type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const data = strFromU8(files["data.json"]);
    expect(data).toContain("Milk");
    expect(data).not.toContain("Private thought");
    expect(data).not.toContain("hash-should-not-leak");
    expect(data).not.toMatch(/hook_token|ics_token|refresh_token/);
    expect(Object.keys(files).some((f) => f.startsWith("spaces/"))).toBe(true);
    signIn(null);
    expect((await exportRoute.GET()).status).toBe(401);
  });
});
