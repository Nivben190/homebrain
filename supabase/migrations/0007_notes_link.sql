-- Which Apple Note a list is linked to (matched by the note's title, i.e. its first line).
alter table public.sections add column if not exists notes_link text;
create index if not exists sections_notes_link_idx on public.sections (household_id, lower(notes_link)) where notes_link is not null;
