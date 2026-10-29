-- See what the other one did (roadmap 2.9). Triggers record ticks, adds,
-- check-ins and arrivals in shared spaces; private spaces never show up.
create table public.activity (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor uuid references auth.users(id) on delete cascade,
  kind text not null, -- added | ticked | checked_in | arrive_home | arrive_store | wake
  title text,
  section_id uuid references public.sections(id) on delete cascade,
  at timestamptz not null default now()
);
create index activity_household_at_idx on public.activity (household_id, at desc);
alter table public.activity enable row level security;
create policy "activity: members read" on public.activity
  for select using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())));
alter publication supabase_realtime add table public.activity;

create or replace function public.log_item_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.sections;
begin
  select * into s from public.sections where id = new.section_id;
  if s.id is null or s.owner_id is not null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.activity (household_id, actor, kind, title, section_id)
    values (s.household_id, coalesce(auth.uid(), new.created_by), 'added', new.title, s.id);
  elsif new.done and not old.done and auth.uid() is not null then
    insert into public.activity (household_id, actor, kind, title, section_id)
    values (s.household_id, auth.uid(), 'ticked', new.title, s.id);
  end if;
  return new;
end $$;
create trigger items_activity after insert or update of done on public.items
  for each row execute function public.log_item_activity();

create or replace function public.log_checkin_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare i record;
begin
  if new.status <> 'done' then return new; end if;
  select it.title, s.id as section_id, s.household_id, s.owner_id into i
    from public.items it join public.sections s on s.id = it.section_id where it.id = new.item_id;
  if i.section_id is null or i.owner_id is not null then return new; end if;
  insert into public.activity (household_id, actor, kind, title, section_id)
  values (i.household_id, coalesce(auth.uid(), new.user_id), 'checked_in', i.title, i.section_id);
  return new;
end $$;
create trigger checkins_activity after insert on public.checkins
  for each row execute function public.log_checkin_activity();

create or replace function public.log_event_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if new.type not in ('arrive_home', 'arrive_store', 'wake') then return new; end if;
  select household_id into h from public.profiles where user_id = new.user_id;
  if h is null then return new; end if;
  insert into public.activity (household_id, actor, kind) values (h, new.user_id, new.type);
  return new;
end $$;
create trigger events_activity after insert on public.events
  for each row execute function public.log_event_activity();

revoke execute on function public.log_item_activity(), public.log_checkin_activity(), public.log_event_activity() from public, anon, authenticated;

select cron.schedule('home-brain-activity', '23 3 * * *', $$delete from public.activity where at < now() - interval '7 days'$$);
