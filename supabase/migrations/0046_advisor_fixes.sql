-- Supabase advisor fixes (review 2026-10-31).

-- 1. Signed-out callers have no reason to reach these security-definer functions.
revoke execute on function public.my_household_id() from public, anon;
grant execute on function public.my_household_id() to authenticated, service_role;
do $$
begin
  -- Created by the dashboard's "auto-enable RLS" event trigger; not in every database.
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- The member policies that call my_household_id() apply to signed-in users only,
-- so a signed-out request simply sees nothing instead of hitting the revoke.
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and roles = '{public}'
      and (qual ilike '%my_household_id%' or with_check ilike '%my_household_id%')
  loop
    execute format('alter policy %I on public.%I to authenticated', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Role policies: auth.uid() once per query, not once per row.
alter policy "sections: role insert" on public.sections
  with check ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and (select my_role()) = 'teen'));
alter policy "sections: role update" on public.sections
  using ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and (select my_role()) = 'teen'))
  with check ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and (select my_role()) = 'teen'));
alter policy "sections: role delete" on public.sections
  using ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and (select my_role()) = 'teen'));
alter policy "automations: role insert" on public.automations
  with check ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and target_user_id = (select auth.uid()) and (select my_role()) = 'teen'));
alter policy "automations: role update" on public.automations
  using ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and target_user_id = (select auth.uid()) and (select my_role()) = 'teen'))
  with check ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and target_user_id = (select auth.uid()) and (select my_role()) = 'teen'));
alter policy "automations: role delete" on public.automations
  using ((select my_role()) in ('owner', 'adult') or (owner_id = (select auth.uid()) and target_user_id = (select auth.uid()) and (select my_role()) = 'teen'));

-- 3. Indexes for the foreign keys the advisor lists.
create index if not exists activity_actor_idx on public.activity (actor);
create index if not exists activity_section_idx on public.activity (section_id);
create index if not exists guest_links_created_by_idx on public.guest_links (created_by);
create index if not exists guest_links_section_idx on public.guest_links (section_id);
create index if not exists household_invites_created_by_idx on public.household_invites (created_by);
create index if not exists household_invites_used_by_idx on public.household_invites (used_by);
create index if not exists meal_plan_item_idx on public.meal_plan (item_id);
create index if not exists sections_pet_idx on public.sections (pet_id);
