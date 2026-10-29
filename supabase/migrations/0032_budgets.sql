-- Household money (roadmap 3.6): a monthly budget per category.
create table public.money_budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  amount numeric not null check (amount >= 0),
  primary key (household_id, category)
);
alter table public.money_budgets enable row level security;
create policy "money_budgets: members" on public.money_budgets for all
  using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())))
  with check (household_id = (select household_id from public.profiles where user_id = (select auth.uid())));
