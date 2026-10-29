-- Sitter and guest links (roadmap 3.3): an expiring link to one space and/or
-- the guest-safe part of the home info card. Read and written only by the
-- server (service role) after checking the token; members manage their links.
create table public.guest_links (
  token text primary key default encode(gen_random_bytes(16), 'hex'),
  household_id uuid not null references public.households(id) on delete cascade,
  section_id uuid references public.sections(id) on delete cascade,
  include_info boolean not null default true,
  label text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index guest_links_household_idx on public.guest_links (household_id);
alter table public.guest_links enable row level security;
create policy "guest_links: members" on public.guest_links for all
  using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())))
  with check (household_id = (select household_id from public.profiles where user_id = (select auth.uid())));

-- A guest's tick says who did it, since there's no account behind it.
alter table public.checkins add column if not exists guest_label text;
