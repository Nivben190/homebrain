-- Meal plan (roadmap 3.5): which recipe is dinner on which day.
create table public.meal_plan (
  household_id uuid not null references public.households(id) on delete cascade,
  day date not null,
  item_id uuid not null references public.items(id) on delete cascade,
  primary key (household_id, day)
);
alter table public.meal_plan enable row level security;
create policy "meal_plan: members" on public.meal_plan for all
  using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())))
  with check (household_id = (select household_id from public.profiles where user_id = (select auth.uid())));
