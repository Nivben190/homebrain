-- Home Brain: core schema
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Households & profiles
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  display_name text not null default '',
  emoji text not null default '🙂',
  locale text not null default 'en' check (locale in ('en', 'he')),
  timezone text not null default 'Asia/Jerusalem',
  phone text,
  email text,
  wake_mode text not null default 'shortcut' check (wake_mode in ('shortcut', 'fixed', 'first_open')),
  wake_time time,
  hook_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  ics_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- Helper used by every RLS policy. SECURITY DEFINER avoids recursive RLS on profiles.
create or replace function public.my_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.profiles where user_id = auth.uid()
$$;

-- Create a profile row automatically on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Sections & items (the Notion part)
-- ---------------------------------------------------------------------------
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade, -- null = shared
  slug text,
  title text not null,
  icon text not null default '📄',
  color text not null default 'violet',
  view text not null default 'list',
  schema jsonb not null default '[]'::jsonb,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, slug)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  title text not null default '',
  props jsonb not null default '{}'::jsonb,
  done boolean not null default false,
  position double precision not null default 0,
  due_at timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_section_idx on public.items (section_id, position);
create index items_due_idx on public.items (due_at) where due_at is not null and not done;

-- ---------------------------------------------------------------------------
-- Brain: automations, jobs, runs, events
-- ---------------------------------------------------------------------------
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '⚡',
  enabled boolean not null default true,
  trigger jsonb not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index automations_next_run_idx on public.automations (next_run_at) where enabled;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_at timestamptz not null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index jobs_due_idx on public.jobs (run_at) where status = 'pending';

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.automations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  body text not null default '',
  icon text not null default '⚡',
  rendered jsonb not null default '[]'::jsonb, -- rendered actions (links, buttons)
  fired_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  done_at timestamptz
);
create index runs_user_idx on public.runs (user_id, fired_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_user_type_idx on public.events (user_id, type, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  created_at timestamptz not null default now()
);

create table public.google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  calendar_id text not null default 'primary',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.sections enable row level security;
alter table public.items enable row level security;
alter table public.automations enable row level security;
alter table public.jobs enable row level security;
alter table public.runs enable row level security;
alter table public.events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.google_tokens enable row level security;

create policy "household: members read" on public.households
  for select using (id = (select public.my_household_id()));
create policy "household: members update" on public.households
  for update using (id = (select public.my_household_id()));

create policy "profiles: read household" on public.profiles
  for select using (user_id = (select auth.uid()) or household_id = (select public.my_household_id()));
create policy "profiles: update self" on public.profiles
  for update using (user_id = (select auth.uid()));

-- Shared sections are visible to the household; private ones only to the owner.
create policy "sections: visible" on public.sections
  for select using (household_id = (select public.my_household_id()) and (owner_id is null or owner_id = (select auth.uid())));
create policy "sections: insert" on public.sections
  for insert with check (household_id = (select public.my_household_id()) and (owner_id is null or owner_id = (select auth.uid())));
create policy "sections: update" on public.sections
  for update using (household_id = (select public.my_household_id()) and (owner_id is null or owner_id = (select auth.uid())));
create policy "sections: delete" on public.sections
  for delete using (household_id = (select public.my_household_id()) and (owner_id is null or owner_id = (select auth.uid())));

create policy "items: via section" on public.items
  for all using (exists (
    select 1 from public.sections s
    where s.id = items.section_id
      and s.household_id = (select public.my_household_id())
      and (s.owner_id is null or s.owner_id = (select auth.uid()))
  )) with check (exists (
    select 1 from public.sections s
    where s.id = items.section_id
      and s.household_id = (select public.my_household_id())
      and (s.owner_id is null or s.owner_id = (select auth.uid()))
  ));

create policy "automations: own" on public.automations
  for all using (owner_id = (select auth.uid()) and household_id = (select public.my_household_id()))
  with check (owner_id = (select auth.uid()) and household_id = (select public.my_household_id()));

create policy "runs: own read" on public.runs for select using (user_id = (select auth.uid()));
create policy "runs: own update" on public.runs for update using (user_id = (select auth.uid()));

create policy "events: own" on public.events
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "push: own" on public.push_subscriptions
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- jobs and google_tokens: service role only (no policies).

-- Users may edit their own profile, but never household_id or the secret tokens
-- (joining a home must go through join_household with an invite code).
revoke update on public.profiles from anon, authenticated;
grant update (display_name, emoji, locale, timezone, phone, wake_mode, wake_time) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Household RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_household(p_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.households (name) values (p_name) returning * into h;
  update public.profiles set household_id = h.id where user_id = auth.uid();
  return h;
end $$;

create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'invalid invite code'; end if;
  update public.profiles set household_id = h.id where user_id = auth.uid();
  return h;
end $$;

-- ---------------------------------------------------------------------------
-- Engine: claim due jobs atomically (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_due_jobs(p_limit int default 50)
returns setof public.jobs language sql security definer set search_path = public as $$
  update public.jobs j set status = 'running'
  where j.id in (
    select id from public.jobs
    where status = 'pending' and run_at <= now()
    order by run_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;

-- Claim due schedule automations by leasing next_run_at 10 minutes ahead (so a
-- crashed tick retries later); the engine then writes the real next_run_at.
create or replace function public.claim_due_schedules(p_limit int default 50)
returns table (automation_id uuid, due_at timestamptz)
language sql security definer set search_path = public as $$
  with due as (
    select id, next_run_at from public.automations
    where enabled and next_run_at is not null and next_run_at <= now()
    order by next_run_at
    limit p_limit
    for update skip locked
  )
  update public.automations a set next_run_at = now() + interval '10 minutes'
  from due where a.id = due.id
  returning a.id, due.next_run_at;
$$;

revoke execute on function public.claim_due_jobs(int) from public, anon, authenticated;
revoke execute on function public.claim_due_schedules(int) from public, anon, authenticated;

-- Realtime for live sync between phones
alter publication supabase_realtime add table public.sections, public.items, public.runs;
