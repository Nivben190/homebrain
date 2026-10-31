-- Plans: a goal over weeks ("3 workouts a week for 8 weeks") with planned
-- sessions. A session's log rides on the day's check-in (what was done, how long,
-- how it felt), the partner's reactions sit next to it, and a fresh check-in on a
-- plan waits for the engine to tell the partner ("Niv finished Push day 💪"),
-- whichever way it was made (the space, Today, a reminder's Done).
alter table public.checkins add column if not exists data jsonb;
alter table public.checkins add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table public.checkins add column if not exists cheer_pending boolean not null default false;
create index if not exists checkins_cheer_idx on public.checkins (created_at) where cheer_pending;

create or replace function public.mark_plan_cheer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'done'
     and (tg_op = 'INSERT' or old.status is distinct from 'done')
     and exists (
       select 1 from public.items i join public.sections s on s.id = i.section_id
       where i.id = new.item_id and s.view = 'plan'
     ) then
    new.cheer_pending := true;
  end if;
  return new;
end;
$$;
drop trigger if exists checkins_plan_cheer on public.checkins;
create trigger checkins_plan_cheer before insert or update of status on public.checkins
  for each row execute function public.mark_plan_cheer();
revoke execute on function public.mark_plan_cheer() from public, anon, authenticated;

-- One person's reaction to a session (empty removes it). Merged in place, so two
-- people reacting at once don't overwrite each other; RLS on checkins decides who may.
create or replace function public.react_to_checkin(p_id uuid, p_emoji text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.checkins
     set reactions = case
       when coalesce(p_emoji, '') = '' then reactions - (select auth.uid())::text
       else reactions || jsonb_build_object((select auth.uid())::text, left(p_emoji, 8))
     end
   where id = p_id;
$$;
revoke execute on function public.react_to_checkin(uuid, text) from public, anon;
grant execute on function public.react_to_checkin(uuid, text) to authenticated;
