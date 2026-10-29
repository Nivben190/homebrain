-- One key per Shortcut (roadmap 1.3). Only SHA-256 hashes are stored; the raw
-- key is shown once. At most one live key per person and purpose.
-- profiles.hook_token keeps working until 2026-11-12 (src/lib/hook-keys.ts);
-- hook_token_used_at shows whether any Shortcut still sends it.

create table public.hook_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('event', 'capture', 'spend', 'checkin', 'notes', 'fridge')),
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index hook_keys_live_idx on public.hook_keys (user_id, purpose) where revoked_at is null;

alter table public.hook_keys enable row level security;
-- People see their own keys' dates; keys are created and revoked by the server.
create policy hook_keys_own_read on public.hook_keys for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.hook_keys from anon, authenticated;

alter table public.profiles add column hook_token_used_at timestamptz;
