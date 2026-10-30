-- pgcrypto lives in the extensions schema, so these failed with
-- "gen_random_bytes does not exist": the owner's New code button, and joining by code.
alter function public.rotate_invite() set search_path = public, extensions;
alter function public.join_household(text) set search_path = public, extensions;
