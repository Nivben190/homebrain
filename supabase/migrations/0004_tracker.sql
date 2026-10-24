-- Trackers: items in a "tracker" space carry a schedule (props._habit) and get
-- reminders + check-ins (Duolingo-style streaks).

alter table public.items add column if not exists remind_at timestamptz;
create index if not exists items_remind_idx on public.items (remind_at) where remind_at is not null;

-- One row per item per local day.
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  day date not null,
  status text not null default 'done' check (status in ('done', 'skipped')),
  note text,
  created_at timestamptz not null default now(),
  unique (item_id, day)
);
create index checkins_item_day_idx on public.checkins (item_id, day desc);
create index checkins_user_idx on public.checkins (user_id);

alter table public.checkins enable row level security;
create policy "checkins: via item" on public.checkins
  for all using (exists (
    select 1 from public.items i join public.sections s on s.id = i.section_id
    where i.id = checkins.item_id
      and s.household_id = (select public.my_household_id())
      and (s.owner_id is null or s.owner_id = (select auth.uid()))
  )) with check (exists (
    select 1 from public.items i join public.sections s on s.id = i.section_id
    where i.id = checkins.item_id
      and s.household_id = (select public.my_household_id())
      and (s.owner_id is null or s.owner_id = (select auth.uid()))
  ));

-- Reminders created for a tracker item link back to it, so "Done" checks it in.
alter table public.runs add column if not exists item_id uuid references public.items(id) on delete cascade;
create index if not exists runs_item_idx on public.runs (item_id);

-- Engine: lease due tracker reminders (same pattern as claim_due_schedules).
create or replace function public.claim_due_items(p_limit int default 50)
returns table (item_id uuid, due_at timestamptz)
language sql security definer set search_path = public as $$
  with due as (
    select id, remind_at from public.items
    where remind_at is not null and remind_at <= now() and not done
    order by remind_at
    limit p_limit
    for update skip locked
  )
  update public.items i set remind_at = now() + interval '10 minutes'
  from due where i.id = due.id
  returning i.id, due.remind_at;
$$;
revoke execute on function public.claim_due_items(int) from public, anon, authenticated;

alter publication supabase_realtime add table public.checkins;
