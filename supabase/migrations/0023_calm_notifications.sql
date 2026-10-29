-- Calmer notifications (roadmap 2.6): quiet hours per person, muted spaces,
-- and an evening digest instead of single pushes. Cards are still written in
-- every case; only the push is held back.
alter table public.profiles
  add column if not exists quiet_from time,
  add column if not exists quiet_to time,
  add column if not exists muted_sections uuid[] not null default '{}',
  add column if not exists digest boolean not null default false;

grant select (quiet_from, quiet_to, muted_sections, digest) on public.profiles to authenticated;
grant update (quiet_from, quiet_to, muted_sections, digest) on public.profiles to authenticated;
