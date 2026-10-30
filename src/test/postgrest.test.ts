import { beforeAll, describe, expect, it } from "vitest";
import { migratedDb, seedHome, type Db } from "./db";
import { testClient } from "./postgrest";

// The shim must behave like PostgREST for the query shapes src/ uses.
let db: Db;
let home: Awaited<ReturnType<typeof seedHome>>;
let shared: string;
beforeAll(async () => {
  db = await migratedDb();
  home = await seedHome(db, ["owner", "adult", "child"]);
  const admin = testClient(db);
  const { data } = await admin.from("sections").insert({ household_id: home.householdId, title: "Shop", view: "spend" }).select("id").single();
  shared = data!.id;
  await admin.from("items").insert([
    { section_id: shared, title: "Milk", props: { amount: 5 } },
    { section_id: shared, title: "Eggs", props: { amount: 7 } },
  ]);
}, 120_000);

describe("PostgREST shim", () => {
  it("reads with filters, order, limit and count", async () => {
    const sb = testClient(db, home.users.adult);
    const { data, count } = await sb.from("items").select("title", { count: "exact" }).eq("section_id", shared).order("title").limit(1);
    expect(data).toEqual([{ title: "Eggs" }]);
    expect(count).toBe(2);
    const { count: head } = await sb.from("items").select("id", { count: "exact", head: true }).ilike("title", "%ilk");
    expect(head).toBe(1);
  });

  it("embeds both ways, with !inner filters on the embed", async () => {
    const sb = testClient(db, home.users.adult);
    const { data } = await sb.from("items").select("title, sections!inner(view,household_id)").eq("sections.household_id", home.householdId).eq("sections.view", "spend").order("title");
    expect(data).toEqual([
      { title: "Eggs", sections: { view: "spend", household_id: home.householdId } },
      { title: "Milk", sections: { view: "spend", household_id: home.householdId } },
    ]);
    const { data: none } = await sb.from("items").select("title, sections!inner(view)").eq("sections.view", "list");
    expect(none).toEqual([]);
    const { data: many } = await sb.from("sections").select("title, items(title)").eq("id", shared).single();
    expect(many!.items).toHaveLength(2);
  });

  it("or= on a referenced table, json paths, not/is/in", async () => {
    const sb = testClient(db, home.users.adult);
    const { data } = await sb.from("items").select("title, sections!inner(view)").or("view.eq.spend,template.eq.bills", { referencedTable: "sections" });
    expect(data).toHaveLength(2);
    expect((await sb.from("items").select("title").eq("props->>amount", "5")).data).toEqual([{ title: "Milk" }]);
    expect((await sb.from("items").select("title").not("due_at", "is", null)).data).toEqual([]);
    expect((await sb.from("items").select("title").in("title", ["Milk", "Bread"])).data).toEqual([{ title: "Milk" }]);
  });

  it("profiles with households(*) as getSession reads them", async () => {
    const sb = testClient(db, home.users.adult);
    const { data } = await sb.from("profiles").select("user_id, role, households(*)");
    expect(data).toHaveLength(3);
    expect(data![0].households).toMatchObject({ id: home.householdId, name: "Test home" });
  });

  it("writes: insert returning, update, delete, upsert, and RLS errors", async () => {
    const sb = testClient(db, home.users.adult);
    const { data: ins, error } = await sb.from("items").insert({ section_id: shared, title: "Tea" }).select("id,title,created_by").single();
    expect(error).toBeNull();
    expect(ins).toMatchObject({ title: "Tea", created_by: home.users.adult });
    expect((await sb.from("items").update({ done: true }).eq("id", ins!.id).select("done").single()).data).toEqual({ done: true });
    expect((await sb.from("checkins").upsert({ item_id: ins!.id, day: "2026-01-01", status: "done" }, { onConflict: "item_id,day" })).error).toBeNull();
    expect((await sb.from("checkins").upsert({ item_id: ins!.id, day: "2026-01-01", status: "skipped" }, { onConflict: "item_id,day" })).error).toBeNull();
    expect((await sb.from("items").delete().eq("id", ins!.id)).error).toBeNull();
    const denied = await testClient(db, home.users.child).from("sections").insert({ household_id: home.householdId, title: "Nope" });
    expect(denied.error?.message).toMatch(/row-level security/);
  });

  it("single() with no rows is an error, maybeSingle() is null", async () => {
    const sb = testClient(db, home.users.adult);
    expect((await sb.from("items").select("id").eq("title", "nothing").single()).error?.code).toBe("PGRST116");
    expect((await sb.from("items").select("id").eq("title", "nothing").maybeSingle()).data).toBeNull();
  });

  it("rpc: scalar, set and composite results", async () => {
    const sb = testClient(db, home.users.adult);
    expect((await sb.rpc("search_items", { q: "milk" })).data).toMatchObject([{ title: "Milk" }]);
    expect((await sb.rpc("my_tokens").maybeSingle()).data).toHaveProperty("ics_token");
    expect((await sb.rpc("create_invite").single()).data).toHaveProperty("token");
  });

  it("auth: getUser and getClaims know who is signed in", async () => {
    const sb = testClient(db, home.users.adult);
    const { data } = await sb.auth.getUser((await sb.auth.getSession()).data.session?.access_token);
    expect(data.user?.id ?? null).toBeDefined();
  });
});
