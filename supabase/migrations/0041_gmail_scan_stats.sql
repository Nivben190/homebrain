-- What the last Gmail scan did (emails read, subscriptions and bills found), so
-- the space can show that scanning works instead of only "checked 3 h ago".
alter table public.gmail_connections add column if not exists scan_stats jsonb;
