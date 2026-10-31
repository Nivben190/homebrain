-- Snooze on a reminder card: the run hides until then, and the engine tick
-- brings it back as a push.
alter table public.runs add column if not exists snoozed_until timestamptz;
create index if not exists runs_snoozed_idx on public.runs (snoozed_until) where snoozed_until is not null;
