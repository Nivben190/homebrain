-- After Gmail rate-limits a scan, the inbox rests: the half-hourly cron skips
-- it until retry_after, instead of hammering the same quota again.
alter table public.gmail_connections add column if not exists retry_after timestamptz;
