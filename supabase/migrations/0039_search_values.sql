-- Search matches what people wrote, not how it's stored: the text and numbers
-- in an item's properties (notes, gift ideas, prices…), without field names,
-- yes/no flags or attachment paths, so "notes", "photos" or "jpg" no longer
-- match everything. And a typed % or _ is a character, not a wildcard.
drop index if exists public.items_search_trgm_idx;
alter table public.items drop column if exists search;
alter table public.items
  add column search text generated always as (
    lower(title || ' ' || coalesce(jsonb_path_query_array(props - '_photos', 'strict $.** ? (@.type() == "string" || @.type() == "number")')::text, ''))
  ) stored;
create index items_search_trgm_idx on public.items using gin (search extensions.gin_trgm_ops);

create or replace function public.search_items(q text, max_rows int default 30)
returns table (id uuid, section_id uuid, title text, done boolean, score real)
language sql stable security invoker set search_path = public, extensions as $$
  select i.id, i.section_id, i.title, i.done,
         greatest(similarity(i.search, lower(q)), case when i.search like p.pattern then 0.5 else 0 end)::real as score
  from public.items i,
       (select '%' || replace(replace(replace(lower(trim(q)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern) p
  where length(trim(q)) >= 2
    and (i.search like p.pattern or i.search % lower(q))
  order by i.done, score desc, i.created_at desc
  limit max_rows;
$$;
