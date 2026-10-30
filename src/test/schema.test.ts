import { beforeAll, describe, expect, it } from "vitest";
import { asUser, migratedDb, seedHome, type Db } from "./db";

let db: Db;
beforeAll(async () => {
  db = await migratedDb();
}, 120_000);

describe("grants", () => {
  // supabase-js upsert is INSERT ... ON CONFLICT DO UPDATE SET <every sent column>,
  // so a column members may insert but not update breaks every save after the first.
  // Tables the app upserts with the member's own client (actions.ts, SectionScreen, OfflineSync).
  const UPSERTED = ["home_info", "meal_plan", "money_budgets", "checkins", "items", "pet_weights", "push_subscriptions"];

  it("every column members may insert into an upserted table they may also update", async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(`
      select i.table_name, i.column_name
      from information_schema.column_privileges i
      where i.grantee = 'authenticated' and i.table_schema = 'public' and i.privilege_type = 'INSERT'
        and i.table_name = any($1)
        and not exists (
          select 1 from information_schema.column_privileges u
          where u.grantee = 'authenticated' and u.table_schema = 'public' and u.privilege_type = 'UPDATE'
            and u.table_name = i.table_name and u.column_name = i.column_name)
      order by 1, 2`, [UPSERTED]);
    expect(rows.map((r) => `${r.table_name}.${r.column_name}`)).toEqual([]);
  });
});

describe("home info", () => {
  const save = (wifi: string, householdId: string) =>
    [`insert into public.home_info (household_id, wifi_name, wifi_password) values ($1, $2, 'pw')
      on conflict (household_id) do update set household_id = excluded.household_id, wifi_name = excluded.wifi_name, wifi_password = excluded.wifi_password
      returning wifi_name`, [householdId, wifi]] as const;

  it("an adult can save the Wi-Fi again and again", async () => {
    const { householdId, users } = await seedHome(db, ["owner", "adult"]);
    await db.query(`insert into public.home_info (household_id, wifi_name) values ($1, 'old')`, [householdId]);
    expect(await asUser(db, users.adult, ...save("new", householdId))).toEqual([{ wifi_name: "new" }]);
  });

  it("a child can't change it, and nobody can write another home's", async () => {
    const mine = await seedHome(db, ["owner", "child"]);
    const theirs = await seedHome(db, ["owner"]);
    await expect(asUser(db, mine.users.child, ...save("x", mine.householdId))).rejects.toThrow();
    await expect(asUser(db, mine.users.owner, ...save("x", theirs.householdId))).rejects.toThrow();
  });

  it("members never read the sealed secrets", async () => {
    const { householdId, users } = await seedHome(db, ["owner"]);
    await expect(asUser(db, users.owner, `select secrets from public.home_info where household_id = $1`, [householdId])).rejects.toThrow(/permission/);
  });
});
