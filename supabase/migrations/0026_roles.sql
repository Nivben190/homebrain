-- Households of any size, with roles (roadmap 3.1).
alter table public.profiles
  add column if not exists role text not null default 'adult'
  check (role in ('owner', 'adult', 'teen', 'child', 'guest'));
grant select (role) on public.profiles to authenticated;

-- The earliest member of each home owns it.
update public.profiles p set role = 'owner'
where p.household_id is not null
  and p.user_id = (select q.user_id from public.profiles q where q.household_id = p.household_id order by q.created_at limit 1);

create or replace function public.create_household(p_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.households (name) values (p_name) returning * into h;
  update public.profiles set household_id = h.id, role = 'owner' where user_id = auth.uid();
  return h;
end $$;

create or replace function public.is_home_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'owner' and household_id is not null);
$$;

-- Joining makes you an adult of the new home.
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

  update public.profiles set household_id = inv.household_id, role = 'adult' where user_id = me;
  update public.household_invites set used_at = now(), used_by = me where token = p_token;
  if old_home is not null and old_home <> inv.household_id and alone then
    delete from public.households where id = old_home;
  end if;
  select * into h from public.households where id = inv.household_id;
  return h;
end $$;

create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'invalid invite code'; end if;
  update public.profiles set household_id = h.id, role = 'adult' where user_id = auth.uid();
  update public.households set invite_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)) where id = h.id returning * into h;
  return h;
end $$;

-- Owner: change someone's role, or hand over ownership (the old owner becomes an adult).
create or replace function public.set_member_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if not public.is_home_owner() then raise exception 'owner only'; end if;
  select household_id into h from public.profiles where user_id = auth.uid();
  if not exists (select 1 from public.profiles where user_id = p_user and household_id = h) then raise exception 'not in this home'; end if;
  if p_user = auth.uid() then raise exception 'hand over ownership instead'; end if;
  if p_role = 'owner' then
    update public.profiles set role = 'adult' where user_id = auth.uid();
  end if;
  update public.profiles set role = p_role where user_id = p_user;
end $$;

-- Owner: remove a member. Their private spaces and automations go with them.
create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if not public.is_home_owner() then raise exception 'owner only'; end if;
  if p_user = auth.uid() then raise exception 'use leave instead'; end if;
  select household_id into h from public.profiles where user_id = auth.uid();
  delete from public.sections where household_id = h and owner_id = p_user;
  delete from public.automations where household_id = h and owner_id = p_user;
  update public.profiles set household_id = null, role = 'adult' where user_id = p_user and household_id = h;
end $$;

-- Anyone: leave. The last one out takes the home with them; an owner hands over to the longest-standing member.
create or replace function public.leave_home()
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; heir uuid;
begin
  select * into me from public.profiles where user_id = auth.uid();
  if me.household_id is null then return; end if;
  select user_id into heir from public.profiles where household_id = me.household_id and user_id <> me.user_id
    order by (role = 'adult') desc, created_at limit 1;
  if heir is null then
    delete from public.households where id = me.household_id;
  else
    if me.role = 'owner' then update public.profiles set role = 'owner' where user_id = heir; end if;
    delete from public.sections where household_id = me.household_id and owner_id = me.user_id;
    delete from public.automations where household_id = me.household_id and owner_id = me.user_id;
  end if;
  update public.profiles set household_id = null, role = 'adult' where user_id = me.user_id;
end $$;

-- Owner: a new invite code; the old one stops working.
create or replace function public.rotate_invite()
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_home_owner() then raise exception 'owner only'; end if;
  update public.households set invite_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
    where id = (select household_id from public.profiles where user_id = auth.uid())
    returning invite_code into code;
  return code;
end $$;

revoke execute on function public.is_home_owner(), public.set_member_role(uuid, text), public.remove_member(uuid), public.leave_home(), public.rotate_invite() from public, anon;
grant execute on function public.is_home_owner(), public.set_member_role(uuid, text), public.remove_member(uuid), public.leave_home(), public.rotate_invite() to authenticated;
