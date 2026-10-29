-- Search the whole house (roadmap 2.4): trigram matching over each item's
-- title and properties, which works the same for Hebrew and English.
create extension if not exists pg_trgm with schema extensions;

alter table public.items
  add column if not exists search text generated always as (lower(title || ' ' || coalesce(props::text, ''))) stored;
create index if not exists items_search_trgm_idx on public.items using gin (search extensions.gin_trgm_ops);

-- Runs as the caller, so RLS keeps it to spaces they can see.
create or replace function public.search_items(q text, max_rows int default 30)
returns table (id uuid, section_id uuid, title text, done boolean, score real)
language sql stable security invoker set search_path = public, extensions as $$
  select i.id, i.section_id, i.title, i.done,
         greatest(similarity(i.search, lower(q)), case when i.search like '%' || lower(q) || '%' then 0.5 else 0 end)::real as score
  from public.items i
  where length(trim(q)) >= 2
    and (i.search like '%' || lower(q) || '%' or i.search % lower(q))
  order by i.done, score desc, i.created_at desc
  limit max_rows;
$$;
revoke execute on function public.search_items(text, int) from public, anon;
grant execute on function public.search_items(text, int) to authenticated;
