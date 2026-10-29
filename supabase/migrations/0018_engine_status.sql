-- Engine heartbeat (roadmap 1.5). The tick writes the single row every minute;
-- /api/health answers 503 when it goes stale, so an uptime monitor can alert.
-- No policies: only the service role reads or writes it.

create table public.engine_status (
  id boolean primary key default true check (id),
  last_tick_at timestamptz not null,
  failed_phases text[] not null default '{}',
  last_error text
);

alter table public.engine_status enable row level security;
revoke all on public.engine_status from anon, authenticated;
