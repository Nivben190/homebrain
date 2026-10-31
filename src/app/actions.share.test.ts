import { beforeAll, describe, expect, it, vi } from "vitest";
import { homeWith, signIn, sql, startApp } from "@/test/app";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const A = await import("./actions");

beforeAll(startApp, 120_000);

/** A home with a space that has filled-in data and a routine. */
async function sharedHome(role = "owner") {
  const home = await homeWith(["owner", role].filter((r, i, a) => a.indexOf(r) === i));
  const schema = [{ id: "p", name: "Price", type: "price" }];
  const [{ id }] = await sql<{ id: string }>(`insert into sections (household_id, title, view, icon, schema) values ($1, 'Pesach list', 'checklist', '🕯️', $2) returning id`, [home.householdId, JSON.stringify(schema)]);
  const habit = { time: "09:00", nudge: false, outdoor: false, repeat: { kind: "interval", every: 2, start: "2026-01-01" }, assign: { kind: "person", userId: home.users.owner } };
  await sql(`insert into items (section_id, title, position, done, props) values ($1, 'Wine', 0, true, '{"p": 90, "_photos": [{"path": "secret.jpg"}]}'), ($1, 'Chairs', 1, false, $2)`, [id, { _habit: habit }]);
  return { home, sectionId: id };
}

describe("space template links", () => {
  it("someone in another home adds the structure, never the data", async () => {
    const { home, sectionId } = await sharedHome();
    signIn(home.users.owner);
    const shared = await A.shareSpaceTemplate(sectionId);
    if (!shared.ok) throw new Error(shared.error);

    const other = await homeWith(["owner"]);
    signIn(other.users.owner);
    const added = await A.addSharedSpace(shared.data.token);
    if (!added.ok) throw new Error(added.error);
    expect(await sql(`select household_id, title, view, icon, owner_id from sections where id = $1`, [added.data.id])).toEqual([
      { household_id: other.householdId, title: "Pesach list", view: "checklist", icon: "🕯️", owner_id: null },
    ]);
    expect(await sql(`select title, done, props from items where section_id = $1 order by position`, [added.data.id])).toEqual([
      { title: "Wine", done: false, props: {} },
      // The schedule travels; who did it (a member of the other home) doesn't.
      { title: "Chairs", done: false, props: { _habit: { time: "09:00", nudge: false, outdoor: false, repeat: { kind: "interval", every: 2, start: "2026-01-01" } } } },
    ]);
  });

  it("a child can't share; stopping sharing ends the link", async () => {
    const { home, sectionId } = await sharedHome("child");
    signIn(home.users.child);
    expect((await A.shareSpaceTemplate(sectionId)).ok).toBe(false);

    signIn(home.users.owner);
    const shared = await A.shareSpaceTemplate(sectionId);
    if (!shared.ok) throw new Error(shared.error);
    expect((await A.unshareSpaceTemplate(sectionId)).ok).toBe(true);
    const other = await homeWith(["owner"]);
    signIn(other.users.owner);
    expect(await A.addSharedSpace(shared.data.token)).toEqual({ ok: false, error: "not found" });
  });

  it("another home can't read or remove a home's links", async () => {
    const { home, sectionId } = await sharedHome();
    signIn(home.users.owner);
    const shared = await A.shareSpaceTemplate(sectionId);
    if (!shared.ok) throw new Error(shared.error);
    const other = await homeWith(["owner"]);
    signIn(other.users.owner);
    expect((await A.unshareSpaceTemplate(sectionId)).ok).toBe(false);
    expect(await sql(`select count(*)::int as n from space_templates where token = $1`, [shared.data.token])).toEqual([{ n: 1 }]);
  });
});
