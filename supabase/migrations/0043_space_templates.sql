-- A space shared as a template link: a snapshot of its structure (layout,
-- properties, item titles, routine schedules), never its data. Owners and
-- adults make and remove them; the /t/<token> page reads them with the
-- service role after checking the token.
create table public.space_templates (
  token text primary key default encode(gen_random_bytes(12), 'hex'),
  household_id uuid not null references public.households(id) on delete cascade,
  section_id uuid references public.sections(id) on delete cascade,
  shape jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index space_templates_household_idx on public.space_templates (household_id);
create index space_templates_section_idx on public.space_templates (section_id);
create index space_templates_created_by_idx on public.space_templates (created_by);
alter table public.space_templates enable row level security;
create policy "space_templates: members read" on public.space_templates for select
  using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())));
create policy "space_templates: owners and adults write" on public.space_templates for all
  using (household_id = (select household_id from public.profiles where user_id = (select auth.uid())) and (select public.my_role()) in ('owner', 'adult'))
  with check (household_id = (select household_id from public.profiles where user_id = (select auth.uid())) and (select public.my_role()) in ('owner', 'adult'));
