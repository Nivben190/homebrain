-- One Gmail account per Subscriptions space (so several inboxes can be tracked).
-- Service-role only: RLS on, no policies. The refresh token is AES-GCM sealed by the app.
create table if not exists public.gmail_connections (
  section_id uuid primary key references public.sections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  refresh_token text not null,
  status text not null default 'ok' check (status in ('ok', 'expired')),
  last_scan_at timestamptz,
  scan_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gmail_connections enable row level security;
create index if not exists gmail_connections_due_idx on public.gmail_connections (status, last_scan_at);
