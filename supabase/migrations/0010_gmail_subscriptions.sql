-- Gmail connection for the Subscriptions space. google_tokens stays service-role
-- only (no RLS policies): the refresh token is AES-GCM sealed by the app.
alter table public.google_tokens
  add column if not exists email text,
  add column if not exists status text not null default 'ok' check (status in ('ok', 'expired')),
  add column if not exists section_id uuid references public.sections(id) on delete set null,
  add column if not exists last_scan_at timestamptz,
  add column if not exists scan_error text;

alter table public.google_tokens alter column calendar_id drop not null;
