import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/** Just enough of Supabase (roles, auth, storage, cron, vault, net) for the migrations to load as in production. */
const SUPABASE_STUBS = `
create schema extensions;
set search_path = public, extensions;
create publication supabase_realtime;
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb ->> 'role' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;

create schema cron;
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
create function vault.create_secret(a text, b text default null, c text default null) returns uuid language sql as $$ select gen_random_uuid() $$;
create schema net;
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;
`;

/** A fresh database with every migration in supabase/migrations applied, in order. */
export async function migratedDb() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs
      .readFileSync(path.join(dir, file), "utf8")
      .replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, "")
      .replace(/create extension if not exists (\w+)( with schema \w+)?/gi, "create extension if not exists $1 schema extensions");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof migratedDb>>;

/** Runs `sql` as a signed-in member (RLS and grants apply), rolled back afterwards. */
export async function asUser<T = Record<string, unknown>>(db: Db, userId: string, sql: string, params: readonly unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await tx.exec("set local role authenticated");
    const res = await tx.query<T>(sql, [...params]);
    await tx.rollback();
    return res.rows;
  });
}

/** Makes a home with one member per role given; returns their ids. */
export async function seedHome(db: Db, roles: string[]) {
  const { rows: [home] } = await db.query<{ id: string }>(`insert into public.households (name) values ('Test home') returning id`);
  const users: Record<string, string> = {};
  for (const role of roles) {
    const { rows: [u] } = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`${role}-${Math.random()}@test`]);
    await db.query(`update public.profiles set household_id = $1, role = $2 where user_id = $3`, [home.id, role, u.id]);
    users[role] = u.id;
  }
  return { householdId: home.id, users };
}
