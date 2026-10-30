import { beforeAll, describe, expect, it, vi } from "vitest";
import { homeWith, sql, startApp } from "@/test/app";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { hashKey, newKey } = await import("@/lib/hook-keys");
const notes = await import("./route");

beforeAll(startApp, 120_000);

let ip = 0;
const post = (key: string | null, body: string, query = "") =>
  notes.POST(new Request(`https://brain.test/api/hooks/notes${query}`, { method: "POST", headers: { ...(key ? { "x-brain-token": key } : {}), "x-forwarded-for": `192.0.2.${++ip % 250}` }, body }));

async function setup() {
  const home = await homeWith(["owner", "adult"]);
  const key = newKey();
  await sql(`insert into hook_keys (user_id, purpose, key_hash) values ($1, 'notes', $2)`, [home.users.owner, hashKey(key)]);
  const [{ id: list }] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Groceries', 'checklist') returning id`, [home.householdId]);
  return { home, key, list };
}
const titles = (list: string) => sql<{ title: string; done: boolean }>(`select title, done from items where section_id = $1 order by position, title`, [list]);

describe("Apple Notes sync", () => {
  it("the 🔄 button links a list to its note; the note's lines come in and app-only items go back out", async () => {
    const { key, list } = await setup();
    await sql(`insert into items (section_id, title, position) values ($1, 'Bread', 0)`, [list]);
    const res = await post(key, "Shopping\n- Milk\n- [x] Eggs", `?section=${list}`);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain("Bread");
    expect(await sql(`select notes_link from sections where id = $1`, [list])).toEqual([{ notes_link: "Shopping" }]);
    expect(await titles(list)).toEqual([
      { title: "Bread", done: false },
      { title: "Milk", done: false },
      { title: "Eggs", done: true },
    ]);
  });

  it("afterwards the automatic Shortcut syncs by the note's title: ticks and removals carry over", async () => {
    const { key, list } = await setup();
    await post(key, "Shopping\n- Milk\n- Eggs", `?section=${list}`);
    await post(key, "Shopping\n- [x] Milk");
    expect(await titles(list)).toEqual([{ title: "Milk", done: true }]);
  });

  it("an unlinked note changes nothing and is logged; a literal 'Text' is flagged", async () => {
    const { home, key, list } = await setup();
    expect(await (await post(key, "Some other note\n- x")).text()).toBe("");
    expect(await titles(list)).toEqual([]);
    expect(await sql(`select payload->>'problem' as problem from events where user_id = $1 and type = 'notes_sync'`, [home.users.owner])).toEqual([{ problem: "unlinked" }]);
    expect(await (await post(key, "Text", `?section=${list}`)).text()).toBe("");
  });

  it("the older JSON form takes the key from the button's input and answers JSON", async () => {
    const { key, list } = await setup();
    const res = await post(null, JSON.stringify({ input: JSON.stringify({ token: key, section: list }), text: "Shopping\n- Apples" }));
    expect(await res.json()).toMatchObject({ ok: true, space: "Groceries", added: 1 });
  });

  it("no key, a wrong key, or someone else's private list: nothing syncs", async () => {
    const { home, key } = await setup();
    const [{ id: theirs }] = await sql<{ id: string }>(`insert into sections (household_id, title, view, owner_id) values ($1, 'Theirs', 'checklist', $2) returning id`, [home.householdId, home.users.adult]);
    expect((await post(null, JSON.stringify({ text: "x" }))).status).toBe(400);
    expect((await post("wrong".repeat(9), JSON.stringify({ text: "x" }))).status).toBe(401);
    await post(key, "Peek\n- x", `?section=${theirs}`);
    expect(await titles(theirs)).toEqual([]);
  });
});
