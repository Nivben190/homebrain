-- More than one pet (roadmap 3.10): a routine space can belong to one pet; unlinked ones show for every pet.
alter table public.sections add column if not exists pet_id uuid references public.pets(id) on delete set null;
