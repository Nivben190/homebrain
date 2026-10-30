import { beforeAll, describe, expect, it } from "vitest";
import { asUser, migratedDb, seedHome, type Db } from "./db";

// Who may do what, table by table: every role in one home, plus a stranger from another.
const ROLES = ["owner", "adult", "teen", "child", "guest", "stranger"] as const;
type Role = (typeof ROLES)[number];

let db: Db;
let u: Record<Role, string>;
let ids: Record<string, string>;

async function one(sql: string, params: unknown[] = []) {
  const { rows } = await db.query<{ id: string }>(sql, params);
  return rows[0]?.id;
}

beforeAll(async () => {
  db = await migratedDb();
  const home = await seedHome(db, ["owner", "adult", "teen", "child", "guest"]);
  const other = await seedHome(db, ["owner"]);
  u = { ...(home.users as Record<Exclude<Role, "stranger">, string>), stranger: other.users.owner };
  const h = home.householdId;
  ids = { home: h, otherHome: other.householdId };
  ids.shared = await one(`insert into sections (household_id, title) values ($1, 'Shopping') returning id`, [h]);
  ids.teenPrivate = await one(`insert into sections (household_id, title, owner_id) values ($1, 'Teen diary', $2) returning id`, [h, u.teen]);
  ids.adultPrivate = await one(`insert into sections (household_id, title, owner_id) values ($1, 'Adult diary', $2) returning id`, [h, u.adult]);
  ids.otherSection = await one(`insert into sections (household_id, title) values ($1, 'Theirs') returning id`, [other.householdId]);
  ids.item = await one(`insert into items (section_id, title) values ($1, 'Milk') returning id`, [ids.shared]);
  ids.privateItem = await one(`insert into items (section_id, title) values ($1, 'Secret') returning id`, [ids.adultPrivate]);
  ids.otherItem = await one(`insert into items (section_id, title) values ($1, 'Their milk') returning id`, [ids.otherSection]);
  await db.query(`insert into checkins (item_id, day, user_id) values ($1, '2026-01-01', $2)`, [ids.item, u.adult]);
  ids.pet = await one(`insert into pets (household_id, name) values ($1, 'Rex') returning id`, [h]);
  ids.automation = await one(
    `insert into automations (household_id, owner_id, target_user_id, name, trigger) values ($1, $2, $2, 'Morning', '{}') returning id`,
    [h, u.adult],
  );
  ids.request = await one(`insert into requests (household_id, from_user, to_user, text) values ($1, $2, $3, 'Feed Rex') returning id`, [h, u.adult, u.child]);
  ids.run = await one(`insert into runs (user_id, household_id, title) values ($1, $2, 'Hi') returning id`, [u.adult, h]);
  await db.query(`insert into meal_plan (household_id, day, item_id) values ($1, '2026-01-01', $2)`, [h, ids.item]);
  await db.query(`insert into money_budgets (household_id, category, amount) values ($1, 'food', 100)`, [h]);
  await db.query(`insert into home_info (household_id, wifi_name) values ($1, 'Home')`, [h]);
  await db.query(`insert into google_tokens (user_id, refresh_token) values ($1, 'sealed')`, [u.adult]);
  await db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/x', 'k', 'a')`, [u.adult]);
}, 120_000);

/** True when the statement ran and touched (or returned) at least one row. */
async function can(role: Role, sql: string, params: unknown[] = []) {
  try {
    return (await asUser(db, u[role], sql, params)).length > 0;
  } catch {
    return false;
  }
}

async function who(sql: string, params: () => unknown[] = () => []) {
  const allowed: Role[] = [];
  for (const role of ROLES) if (await can(role, sql, params())) allowed.push(role);
  return allowed;
}

const MEMBERS: Role[] = ["owner", "adult", "teen", "child", "guest"];
const RUNS_HOME: Role[] = ["owner", "adult"];

describe("sections", () => {
  it("members see shared spaces; private ones only their owner", async () => {
    expect(await who(`select 1 from sections where id = $1`, () => [ids.shared])).toEqual(MEMBERS);
    expect(await who(`select 1 from sections where id = $1`, () => [ids.teenPrivate])).toEqual(["teen"]);
  });
  it("only owners and adults add shared spaces; a teen may add their own", async () => {
    expect(await who(`insert into sections (household_id, title) values ($1, 'New') returning 1`, () => [ids.home])).toEqual(RUNS_HOME);
    for (const role of MEMBERS) {
      const ok = await can(role, `insert into sections (household_id, title, owner_id) values ($1, 'Mine', auth.uid()) returning 1`, [ids.home]);
      expect([role, ok]).toEqual([role, ["owner", "adult", "teen"].includes(role)]);
    }
  });
  it("only owners and adults rename or delete shared spaces", async () => {
    expect(await who(`update sections set title = 'X' where id = $1 returning 1`, () => [ids.shared])).toEqual(RUNS_HOME);
    expect(await who(`delete from sections where id = $1 returning 1`, () => [ids.shared])).toEqual(RUNS_HOME);
  });
  it("only that home's own members write into it", async () => {
    expect(await who(`insert into sections (household_id, title) values ($1, 'Sneaky') returning 1`, () => [ids.otherHome])).toEqual(["stranger"]);
  });
});

describe("items and check-ins", () => {
  it("every member can read, add and tick shared items", async () => {
    expect(await who(`select 1 from items where id = $1`, () => [ids.item])).toEqual(MEMBERS);
    expect(await who(`insert into items (section_id, title) values ($1, 'Eggs') returning 1`, () => [ids.shared])).toEqual(MEMBERS);
    expect(await who(`update items set done = true where id = $1 returning 1`, () => [ids.item])).toEqual(MEMBERS);
    expect(await who(`insert into checkins (item_id, day) values ($1, '2026-02-02') returning 1`, () => [ids.item])).toEqual(MEMBERS);
  });
  it("private items stay private; other homes' items are out of reach", async () => {
    expect(await who(`select 1 from items where id = $1`, () => [ids.privateItem])).toEqual(["adult"]);
    expect(await who(`select 1 from items where id = $1`, () => [ids.otherItem])).toEqual(["stranger"]);
    expect(await who(`insert into items (section_id, title) values ($1, 'x') returning 1`, () => [ids.otherSection])).toEqual(["stranger"]);
  });
});

describe("home-wide settings", () => {
  it("only owners and adults change automations, guest links, home info and budgets", async () => {
    expect(await who(`update automations set name = 'x' where id = $1 returning 1`, () => [ids.automation])).toEqual(["adult"]);
    expect(await who(`insert into guest_links (household_id, expires_at) values ($1, now() + interval '1 day') returning 1`, () => [ids.home])).toEqual(RUNS_HOME);
    expect(await who(`update home_info set wifi_name = 'x' where household_id = $1 returning 1`, () => [ids.home])).toEqual(RUNS_HOME);
    expect(await who(`update money_budgets set amount = 1 where household_id = $1 returning 1`, () => [ids.home])).toEqual(RUNS_HOME);
  });
  it("a teen may add an automation only for themselves", async () => {
    const sql = `insert into automations (household_id, owner_id, target_user_id, name, trigger) values ($1, auth.uid(), $2, 'x', '{}') returning 1`;
    expect(await can("teen", sql, [ids.home, u.teen])).toBe(true);
    expect(await can("teen", sql, [ids.home, u.child])).toBe(false);
    expect(await can("child", sql, [ids.home, u.child])).toBe(false);
  });
  it("everyone but guests plans meals", async () => {
    expect(await who(`insert into meal_plan (household_id, day, item_id) values ($1, '2026-03-03', $2) returning 1`, () => [ids.home, ids.item])).toEqual(["owner", "adult", "teen", "child"]);
  });
  it("members read home info, never the sealed secrets", async () => {
    expect(await who(`select wifi_name from home_info where household_id = $1`, () => [ids.home])).toEqual(MEMBERS);
    expect(await who(`select secrets from home_info where household_id = $1`, () => [ids.home])).toEqual([]);
  });
});

describe("people", () => {
  it("members see each other but nobody can promote themselves or move homes", async () => {
    expect(await who(`select 1 from profiles where user_id = $1`, () => [u.adult])).toEqual(MEMBERS);
    expect(await who(`update profiles set role = 'owner' where user_id = auth.uid() returning 1`)).toEqual([]);
    expect(await who(`update profiles set household_id = $1 where user_id = auth.uid() returning 1`, () => [ids.otherHome])).toEqual([]);
    expect(await who(`update profiles set display_name = 'x' where user_id = $1 returning 1`, () => [u.adult])).toEqual(["adult"]);
  });
  it("tokens stay private, even to yourself", async () => {
    expect(await who(`select hook_token from profiles where user_id = auth.uid()`)).toEqual([]);
    expect(await who(`select ics_token from profiles where user_id = auth.uid()`)).toEqual([]);
    expect(await who(`select refresh_token from google_tokens`)).toEqual([]);
  });
  it("requests: anyone asks someone at home; only the recipient answers", async () => {
    expect(await who(`insert into requests (household_id, to_user, text) values ($1, $2, 'Help') returning 1`, () => [ids.home, u.owner])).toEqual(MEMBERS);
    expect(await who(`update requests set status = 'done' where id = $1 returning 1`, () => [ids.request])).toEqual(["child"]);
    expect(await who(`update requests set text = 'changed' where id = $1 returning 1`, () => [ids.request])).toEqual([]);
    expect(await who(`insert into requests (household_id, to_user, text) values ($1, $2, 'x') returning 1`, () => [ids.home, u.stranger])).toEqual([]);
  });
  it("a home's join code can't be rewritten by its members", async () => {
    expect(await who(`update households set invite_code = 'HACKED' where id = $1 returning 1`, () => [ids.home])).toEqual([]);
  });
});

describe("personal data", () => {
  it("runs, push subscriptions and Brain logs belong to one person", async () => {
    expect(await who(`select 1 from runs where id = $1`, () => [ids.run])).toEqual(["adult"]);
    expect(await who(`select 1 from push_subscriptions`)).toEqual(["adult"]);
    expect(await who(`select 1 from automations where id = $1`, () => [ids.automation])).toEqual(["adult"]);
  });
  it("server-only tables are closed to members", async () => {
    for (const t of ["jobs", "rate_limits", "engine_status", "gmail_connections", "calendar_connections", "household_invites"]) {
      expect([t, await who(`select 1 from ${t} limit 1`)]).toEqual([t, []]);
      expect([t, await can("owner", `delete from ${t} returning 1`)]).toEqual([t, false]);
    }
  });
});

describe("pets", () => {
  it("members of the home look after its pets", async () => {
    expect(await who(`select 1 from pets where id = $1`, () => [ids.pet])).toEqual(MEMBERS);
    expect(await who(`insert into pet_weights (pet_id, day, kg) values ($1, '2026-04-04', 20) returning 1`, () => [ids.pet])).toEqual(MEMBERS);
  });
});

describe("the home itself", () => {
  it("only owners and adults rename it", async () => {
    expect(await who(`update households set name = 'Ours' where id = $1 returning 1`, () => [ids.home])).toEqual(RUNS_HOME);
  });
});
