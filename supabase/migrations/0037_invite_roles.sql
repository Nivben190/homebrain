-- Whoever accepts an invite joins as an adult, so only owners and adults may make one.
create or replace function public.create_invite()
returns public.household_invites language plpgsql security definer set search_path = public as $$
declare h uuid; i public.household_invites;
begin
  select household_id into h from public.profiles where user_id = auth.uid() and role in ('owner', 'adult');
  if h is null then raise exception 'owners and adults only'; end if;
  insert into public.household_invites (household_id, created_by) values (h, auth.uid()) returning * into i;
  return i;
end $$;
