-- Invite links (roadmap 2.1): /join/<token>, single-use and valid for 7 days.
-- The 8-character household code still works, but rotates after every join,
-- so a code seen once can't be reused later.

create table public.household_invites (
  token text primary key default encode(gen_random_bytes(16), 'hex'),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);
create index household_invites_household_idx on public.household_invites (household_id);
alter table public.household_invites enable row level security;
-- Service role and the RPCs below only.

-- A fresh link for the caller's home; older unused links stay valid until they expire.
create or replace function public.create_invite()
returns public.household_invites language plpgsql security definer set search_path = public as $$
declare h uuid; i public.household_invites;
begin
  select household_id into h from public.profiles where user_id = auth.uid();
  if h is null then raise exception 'no home'; end if;
  insert into public.household_invites (household_id, created_by) values (h, auth.uid()) returning * into i;
  return i;
end $$;

-- Joins the home behind an invite link. A caller who already has a home moves:
-- with p_bring their spaces come along (all of them when they were alone there,
-- otherwise their private ones), and a home left with nobody in it is deleted.
create or replace function public.accept_invite(p_token text, p_bring boolean default false)
returns public.households language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.household_invites;
  old_home uuid;
  alone boolean;
  h public.households;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into inv from public.household_invites where token = p_token for update;
  if inv.token is null or inv.used_at is not null or inv.expires_at < now() then raise exception 'invite expired'; end if;
  select household_id into old_home from public.profiles where user_id = me;

  if old_home is not null and old_home <> inv.household_id then
    select not exists (select 1 from public.profiles where household_id = old_home and user_id <> me) into alone;
    if p_bring then
      update public.sections set household_id = inv.household_id where household_id = old_home and (alone or owner_id = me);
      update public.automations set household_id = inv.household_id where household_id = old_home and (alone or owner_id = me);
      if alone then update public.pets set household_id = inv.household_id where household_id = old_home; end if;
    end if;
  end if;

  update public.profiles set household_id = inv.household_id where user_id = me;
  update public.household_invites set used_at = now(), used_by = me where token = p_token;
  if old_home is not null and old_home <> inv.household_id and alone then
    delete from public.households where id = old_home;
  end if;
  select * into h from public.households where id = inv.household_id;
  return h;
end $$;

-- The code rotates once someone has used it.
create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'invalid invite code'; end if;
  update public.profiles set household_id = h.id where user_id = auth.uid();
  update public.households set invite_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)) where id = h.id returning * into h;
  return h;
end $$;

revoke execute on function public.create_invite() from public, anon;
revoke execute on function public.accept_invite(text, boolean) from public, anon;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.accept_invite(text, boolean) to authenticated;
