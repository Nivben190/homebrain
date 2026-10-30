import { beforeAll, describe, expect, it } from "vitest";
import { actAs, asUser, migratedDb, seedHome, type Db } from "./db";

// The database functions members can call skip RLS, so each must do its own checks.
let db: Db;
beforeAll(async () => {
  db = await migratedDb();
}, 120_000);

const call = (userId: string, sql: string, params: unknown[] = []) => asUser(db, userId, sql, params);
const lonely = async () => (await seedHome(db, ["owner"])).users.owner;

describe("who may call what", () => {
  it("engine and trigger functions are closed to members and the public", async () => {
    const { rows } = await db.query<{ name: string }>(`
      select p.proname as name from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
        and p.proname in ('claim_due_items', 'claim_due_jobs', 'claim_due_schedules', 'handle_new_user', 'log_checkin_activity',
                          'log_event_activity', 'log_item_activity', 'on_checkin_ack_runs', 'on_item_done_ack_runs')`);
    expect(rows.map((r) => r.name)).toEqual([]);
  });
  it("signed-out visitors call nothing that changes a home", async () => {
    const { rows } = await db.query<{ name: string }>(`
      select p.proname as name from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
        and p.proname <> 'my_household_id' -- read-only, null when signed out
      order by 1`);
    expect(rows.map((r) => r.name)).toEqual([]);
  });
});

describe("joining homes", () => {
  it("create_household makes you its owner", async () => {
    const { rows: [u] } = await db.query<{ id: string }>(`insert into auth.users (email) values ('new@test') returning id`);
    await actAs(db, u.id, `select public.create_household('Ours')`);
    const { rows } = await db.query(`select h.name, p.role from profiles p join households h on h.id = p.household_id where p.user_id = $1`, [u.id]);
    expect(rows).toEqual([{ name: "Ours", role: "owner" }]);
  });

  it("an invite is single-use and makes you an adult", async () => {
    const home = await seedHome(db, ["owner", "child"]);
    const { rows: [{ token }] } = await db.query<{ token: string }>(
      `insert into household_invites (household_id, created_by) values ($1, $2) returning token`, [home.householdId, home.users.owner]);
    const joiner = await lonely();
    await actAs(db, joiner, `select public.accept_invite($1)`, [token]);
    const { rows: [p] } = await db.query<{ household_id: string; role: string }>(`select household_id, role from profiles where user_id = $1`, [joiner]);
    expect(p).toEqual({ household_id: home.householdId, role: "adult" });
    await expect(call(await lonely(), `select public.accept_invite($1)`, [token])).rejects.toThrow(/expired/);
  });

  it("an expired invite or a wrong code gets you nowhere", async () => {
    const home = await seedHome(db, ["owner"]);
    const { rows: [{ token }] } = await db.query<{ token: string }>(
      `insert into household_invites (household_id, created_by, expires_at) values ($1, $2, now() - interval '1 minute') returning token`,
      [home.householdId, home.users.owner]);
    await expect(call(await lonely(), `select public.accept_invite($1)`, [token])).rejects.toThrow(/expired/);
    await expect(call(await lonely(), `select public.join_household('NOPE0000')`)).rejects.toThrow();
  });

  it("only owners and adults make invites", async () => {
    const home = await seedHome(db, ["owner", "adult", "teen", "child", "guest"]);
    for (const [role, id] of Object.entries(home.users)) {
      const ok = await call(id, `select public.create_invite()`).then(() => true, () => false);
      expect([role, ok]).toEqual([role, role === "owner" || role === "adult"]);
    }
  });
});

describe("owner tools", () => {
  it("only the owner changes roles, removes members or rotates the code", async () => {
    const home = await seedHome(db, ["owner", "adult", "child"]);
    const { users } = home;
    await expect(call(users.adult, `select public.set_member_role($1, 'owner')`, [users.adult])).rejects.toThrow();
    await expect(call(users.adult, `select public.remove_member($1)`, [users.child])).rejects.toThrow();
    await expect(call(users.child, `select public.rotate_invite()`)).rejects.toThrow();
    await expect(call(users.owner, `select public.set_member_role($1, 'teen')`, [users.child])).resolves.toBeDefined();
  });

  it("an owner can't reach into another home", async () => {
    const mine = await seedHome(db, ["owner"]);
    const theirs = await seedHome(db, ["owner", "adult"]);
    await actAs(db, mine.users.owner, `select public.remove_member($1)`, [theirs.users.adult]);
    await expect(call(mine.users.owner, `select public.set_member_role($1, 'guest')`, [theirs.users.adult])).rejects.toThrow();
    const { rows } = await db.query(`select household_id, role from profiles where user_id = $1`, [theirs.users.adult]);
    expect(rows).toEqual([{ household_id: theirs.householdId, role: "adult" }]);
  });
});

describe("search", () => {
  it("finds this home's items, never another's or someone's private ones", async () => {
    const home = await seedHome(db, ["owner", "adult"]);
    const other = await seedHome(db, ["owner"]);
    const { rows: [s] } = await db.query<{ id: string }>(`insert into sections (household_id, title) values ($1, 'Shop') returning id`, [home.householdId]);
    const { rows: [p] } = await db.query<{ id: string }>(`insert into sections (household_id, title, owner_id) values ($1, 'Mine', $2) returning id`, [home.householdId, home.users.adult]);
    const { rows: [o] } = await db.query<{ id: string }>(`insert into sections (household_id, title) values ($1, 'Theirs') returning id`, [other.householdId]);
    await db.query(`insert into items (section_id, title) values ($1, 'zucchini shared'), ($2, 'zucchini private'), ($3, 'zucchini theirs')`, [s.id, p.id, o.id]);
    const titles = async (id: string) => (await call(id, `select title from public.search_items('zucchini')`)).map((r) => r.title).sort();
    expect(await titles(home.users.owner)).toEqual(["zucchini shared"]);
    expect(await titles(home.users.adult)).toEqual(["zucchini private", "zucchini shared"]);
  });
});

describe("rate limits", () => {
  it("lets the first calls through, then stops; members can't touch the counters", async () => {
    const hit = async () => (await db.query<{ ok: boolean }>(`select public.hit_rate_limit('t', 2, 60) as ok`)).rows[0].ok;
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false]);
    await expect(call(await lonely(), `select public.hit_rate_limit('signup:1.2.3.4', 1, 60)`)).rejects.toThrow(/permission/);
  });
});
