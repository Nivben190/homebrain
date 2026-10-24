-- Google Calendar write access, one connection per person, separate from the
-- per-space Gmail connections. Service-role only; the refresh token is sealed by the app.
create table if not exists public.calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  refresh_token text not null,
  status text not null default 'ok' check (status in ('ok', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.calendar_connections enable row level security;

-- The Google event an item was added as (so editing the date moves it).
alter table public.items add column if not exists gcal_event_id text;
