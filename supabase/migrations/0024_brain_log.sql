-- Brain activity log (roadmap 2.7): what each automation did, or why it didn't.
create table public.automation_log (
  id bigint generated always as identity primary key,
  automation_id uuid not null references public.automations(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  status text not null,
  reason text,
  run_id uuid,
  at timestamptz not null default now()
);
create index automation_log_household_at_idx on public.automation_log (household_id, at desc);
create index automation_log_automation_idx on public.automation_log (automation_id);
alter table public.automation_log enable row level security;
create policy "automation_log: members read" on public.automation_log
  for select using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())));

-- Two weeks is plenty to see why something didn't fire.
select cron.schedule('home-brain-automation-log', '17 3 * * *', $$delete from public.automation_log where at < now() - interval '14 days'$$);
