import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app, homeWith, signIn, sql, startApp } from "@/test/app";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

process.env.GEMINI_API_KEY = "test-key";
const { hashKey, newKey } = await import("@/lib/hook-keys");
const fridge = await import("./route");

beforeAll(startApp, 120_000);

/** What the pretend Gemini sees in the photo. */
let seen: unknown[] | "down";
beforeEach(() => {
  seen = [];
  app.pushes = [];
  app.respond = (url) => {
    if (!url.includes("generativelanguage.googleapis.com")) return undefined;
    if (seen === "down") return new Response("unavailable", { status: 503 });
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(seen) }] } }] };
  };
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
let ip = 0;
const photo = (opts: { key?: string; type?: string; body?: Uint8Array; space?: string } = {}) =>
  fridge.POST(
    new Request(`https://brain.test/api/fridge/scan${opts.space ? `?space=${opts.space}` : ""}`, {
      method: "POST",
      headers: { "content-type": opts.type ?? "image/jpeg", "x-forwarded-for": `203.0.113.${++ip % 250}`, ...(opts.key ? { "x-brain-token": opts.key } : {}) },
      body: opts.body ?? jpeg,
    }),
  );

async function setup() {
  const home = await homeWith(["owner"]);
  const [{ id: fridgeId }] = await sql<{ id: string }>(`insert into sections (household_id, title, view, icon) values ($1, 'Fridge', 'fridge', '🧊') returning id`, [home.householdId]);
  const [{ id: groceries }] = await sql<{ id: string }>(`insert into sections (household_id, title, template, view) values ($1, 'Groceries', 'groceries', 'checklist') returning id`, [home.householdId]);
  const key = newKey();
  await sql(`insert into hook_keys (user_id, purpose, key_hash) values ($1, 'fridge', $2)`, [home.users.owner, hashKey(key)]);
  return { home, fridgeId, groceries, key };
}

describe("fridge scan", () => {
  it("a photo becomes the inventory; a staple running low goes on the list and buzzes", async () => {
    const { fridgeId, groceries, key, home } = await setup();
    await sql(`insert into items (section_id, title, props) values ($1, 'Milk', '{"_fridge":{"level":"full","staple":true}}')`, [fridgeId]);
    seen = [
      { name: "Milk", level: "low", qty: 1, emoji: "🥛" },
      { name: "Hummus", level: "full", emoji: "🫘" },
    ];
    const res = await photo({ key });
    expect(await res.json()).toMatchObject({ ok: true, seen: 2, added: ["Hummus"], toBuy: ["Milk"] });
    expect((await sql(`select title from items where section_id = $1 order by title`, [fridgeId])).map((r) => r.title)).toEqual(["Hummus", "Milk"]);
    expect(await sql(`select title from items where section_id = $1`, [groceries])).toEqual([{ title: "Milk" }]);
    expect(app.pushes.map((p) => p.userId)).toEqual([home.users.owner]);
    // The space is free for the next scan.
    expect((await sql<{ s: string | null }>(`select settings->>'scanningAt' as s from sections where id = $1`, [fridgeId]))[0].s).toBeNull();
  });

  it("from the app, signed in, with no buzz", async () => {
    const { home } = await setup();
    signIn(home.users.owner);
    seen = [{ name: "Eggs", level: "half", qty: 6, emoji: "🥚" }];
    expect(await (await photo()).json()).toMatchObject({ ok: true, added: ["Eggs"] });
    expect(app.pushes).toEqual([]);
  });

  it("refuses strangers, non-images, empty or huge bodies, and says when Gemini is down", async () => {
    const { key } = await setup();
    signIn(null);
    expect((await photo()).status).toBe(401);
    expect((await photo({ key, type: "application/pdf" })).status).toBe(415);
    expect((await photo({ key, body: new Uint8Array() })).status).toBe(400);
    expect((await photo({ key, body: new Uint8Array(9 * 1024 * 1024) })).status).toBe(413);
    seen = "down";
    expect((await photo({ key })).status).toBe(502);
  });

  it("one scan at a time per fridge", async () => {
    const { fridgeId, key } = await setup();
    await sql(`update sections set settings = jsonb_build_object('scanningAt', now()) where id = $1`, [fridgeId]);
    expect((await photo({ key })).status).toBe(409);
  });

  it("a home without a Fridge space is told so", async () => {
    const home = await homeWith(["owner"]);
    const key = newKey();
    await sql(`insert into hook_keys (user_id, purpose, key_hash) values ($1, 'fridge', $2)`, [home.users.owner, hashKey(key)]);
    expect((await photo({ key })).status).toBe(404);
  });
});
