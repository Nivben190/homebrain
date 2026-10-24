-- Apple Notes sync: the linked note as of the last sync (normalized line → ticked),
-- so only changes made in the note since then are applied to the list.
alter table public.sections add column if not exists notes_state jsonb;
