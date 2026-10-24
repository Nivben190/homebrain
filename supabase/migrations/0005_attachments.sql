-- Photos, scans and PDFs on items. Files live at
--   attachments/<household_id>/<section_id>/<item_id>/<file>
-- and are visible exactly when the section is (shared → household, private → owner).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Runs as the caller, so sections RLS decides visibility.
create or replace function public.can_access_attachment(p_name text)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.sections s
    where s.id::text = (storage.foldername(p_name))[2]
      and s.household_id::text = (storage.foldername(p_name))[1]
  )
$$;

create policy "attachments: read" on storage.objects
  for select to authenticated using (bucket_id = 'attachments' and public.can_access_attachment(name));
create policy "attachments: upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'attachments' and public.can_access_attachment(name));
create policy "attachments: delete" on storage.objects
  for delete to authenticated using (bucket_id = 'attachments' and public.can_access_attachment(name));
