-- Review fix (3.1): ownership passes to an adult first, then a teen; never to a child or guest while either exists.
create or replace function public.leave_home()
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; heir uuid;
begin
  select * into me from public.profiles where user_id = auth.uid();
  if me.household_id is null then return; end if;
  select user_id into heir from public.profiles where household_id = me.household_id and user_id <> me.user_id
    order by array_position(array['adult', 'teen', 'child', 'guest'], role), created_at limit 1;
  if heir is null then
    delete from public.households where id = me.household_id;
  else
    if me.role = 'owner' then update public.profiles set role = 'owner' where user_id = heir; end if;
    delete from public.sections where household_id = me.household_id and owner_id = me.user_id;
    delete from public.automations where household_id = me.household_id and owner_id = me.user_id;
  end if;
  update public.profiles set household_id = null, role = 'adult' where user_id = me.user_id;
end $$;
