-- Emails to the app's owner: when the last engine email went out (one an hour
-- at most) and which Sunday the weekly report was sent for.
alter table public.engine_status
  add column if not exists alerted_at timestamptz,
  add column if not exists weekly_report_on date;
