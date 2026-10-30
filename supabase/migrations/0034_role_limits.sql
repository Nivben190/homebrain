-- Roles that mean something (roadmap 3.1 review): restrictive write policies
-- layered on the member policies; reading stays as it was. Owners and adults
-- run the home; teens manage their own private spaces and automations;
-- children and guests can tick and add items but not reshape the home.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid();
$$;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

do $$
declare
  rule record;
  op text;
begin
  for rule in
    select * from (values
      -- table, who may write
      ('sections', $q$public.my_role() in ('owner', 'adult') or (owner_id = auth.uid() and public.my_role() = 'teen')$q$),
      ('automations', $q$public.my_role() in ('owner', 'adult') or (owner_id = auth.uid() and target_user_id = auth.uid() and public.my_role() = 'teen')$q$),
      ('guest_links', $q$public.my_role() in ('owner', 'adult')$q$),
      ('home_info', $q$public.my_role() in ('owner', 'adult')$q$),
      ('money_budgets', $q$public.my_role() in ('owner', 'adult')$q$),
      ('meal_plan', $q$public.my_role() <> 'guest'$q$)
    ) as r(tbl, cond)
  loop
    foreach op in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', rule.tbl || ': role ' || op, rule.tbl);
      if op = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)', rule.tbl || ': role ' || op, rule.tbl, rule.cond);
      elsif op = 'update' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)', rule.tbl || ': role ' || op, rule.tbl, rule.cond, rule.cond);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (%s)', rule.tbl || ': role ' || op, rule.tbl, rule.cond);
      end if;
    end loop;
  end loop;
end $$;
