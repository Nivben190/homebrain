-- Gaps the role matrix test found (src/test/rls.test.ts).
-- 1. Any member could rewrite the home's join code. Members only ever rename it, and only owners and adults.
revoke update on public.households from authenticated;
grant update (name) on public.households to authenticated;
drop policy if exists "households: role update" on public.households;
create policy "households: role update" on public.households as restrictive for update to authenticated
  using (public.my_role() in ('owner', 'adult')) with check (public.my_role() in ('owner', 'adult'));

-- 2. A request could be addressed to someone outside the home.
drop policy if exists "requests: send" on public.requests;
create policy "requests: send" on public.requests for insert with check (
  household_id = (select public.my_household_id())
  and from_user = (select auth.uid())
  and exists (select 1 from public.profiles p where p.user_id = to_user and p.household_id = requests.household_id)
);
