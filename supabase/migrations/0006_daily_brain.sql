-- Daily brain: briefing / wrap-up / Shabbat settings, dog profile, partner requests.

-- ---------------------------------------------------------------------------
-- Profile settings
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists place text,
  add column if not exists briefing boolean not null default true,
  add column if not exists wrapup boolean not null default true,
  add column if not exists wrapup_time time not null default '21:30',
  add column if not exists quiet_shabbat boolean not null default false,
  add column if not exists shabbat_shop boolean not null default true;

grant update (lat, lon, place, briefing, wrapup, wrapup_time, quiet_shabbat, shabbat_shop) on public.profiles to authenticated;

-- Which template a space came from (lets the dog screen find dog spaces).
alter table public.sections add column if not exists template text;

-- ---------------------------------------------------------------------------
-- Dog profile
-- ---------------------------------------------------------------------------
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  emoji text not null default '🐶',
  breed text,
  birthday date,
  chip text,
  vet_name text,
  vet_phone text,
  food_bag_kg numeric,
  daily_grams numeric,
  bag_started date,
  food_alerted_bag date,
  notes text,
  created_at timestamptz not null default now()
);
create index pets_household_idx on public.pets (household_id);

create table public.pet_weights (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  day date not null,
  kg numeric not null check (kg > 0 and kg < 200),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (pet_id, day)
);

alter table public.pets enable row level security;
alter table public.pet_weights enable row level security;

create policy "pets: household" on public.pets
  for all using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

create policy "pet weights: via pet" on public.pet_weights
  for all using (exists (select 1 from public.pets p where p.id = pet_weights.pet_id and p.household_id = (select public.my_household_id())))
  with check (exists (select 1 from public.pets p where p.id = pet_weights.pet_id and p.household_id = (select public.my_household_id())));

-- ---------------------------------------------------------------------------
-- Partner requests ("Can you…?")
-- ---------------------------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade default auth.uid(),
  to_user uuid not null references auth.users(id) on delete cascade,
  text text not null check (length(text) between 1 and 300),
  due_day date,
  status text not null default 'open' check (status in ('open', 'doing', 'done', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_to_idx on public.requests (to_user, status);
create index requests_household_idx on public.requests (household_id);

alter table public.requests enable row level security;
create policy "requests: household read" on public.requests
  for select using (household_id = (select public.my_household_id()));
create policy "requests: send" on public.requests
  for insert with check (household_id = (select public.my_household_id()) and from_user = (select auth.uid()));
create policy "requests: update" on public.requests
  for update using (household_id = (select public.my_household_id()));
create policy "requests: delete own" on public.requests
  for delete using (from_user = (select auth.uid()));

alter publication supabase_realtime add table public.requests;
