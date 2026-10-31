-- Push you can trust (roadmap 1.10): which devices accepted each push, and when
-- each device was last seen, so phones that are gone get pruned after 60 days.
alter table public.push_subscriptions add column if not exists last_seen_at timestamptz not null default now();

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.runs(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  device_label text,
  ok boolean not null,
  -- HTTP status from the push service; null when the request never got an answer.
  status int,
  attempts int not null default 1,
  created_at timestamptz not null default now()
);
create index push_deliveries_run_idx on public.push_deliveries (run_id);
create index push_deliveries_user_idx on public.push_deliveries (user_id, created_at desc);
create index push_deliveries_subscription_idx on public.push_deliveries (subscription_id);

-- Written by the engine (service role); people read their own.
alter table public.push_deliveries enable row level security;
create policy "push deliveries: own read" on public.push_deliveries for select using (user_id = (select auth.uid()));
