-- Home info card (roadmap 3.9): Wi-Fi, accounts, contacts and the vet in one
-- place. `secrets` (alarm code and the like) is encrypted by the app and never
-- readable by members directly; the owner reads it through a server action.
create table public.home_info (
  household_id uuid primary key references public.households(id) on delete cascade,
  wifi_name text,
  wifi_password text,
  -- { accounts: [{label, value}], contacts: [{label, phone}], vet: {name, phone}, notes }
  info jsonb not null default '{}'::jsonb,
  -- Which parts a guest or sitter link may show: subset of wifi, contacts, vet, notes.
  guest_fields text[] not null default '{wifi,contacts,vet}',
  secrets text,
  updated_at timestamptz not null default now()
);
alter table public.home_info enable row level security;
create policy "home_info: members" on public.home_info for all
  using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())))
  with check (household_id = (select household_id from public.profiles where user_id = (select auth.uid())));
revoke select (secrets), update (secrets), insert (secrets) on public.home_info from anon, authenticated;
