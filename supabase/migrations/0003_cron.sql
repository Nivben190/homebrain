-- Engine heartbeat: call the app's /api/engine/tick every minute.
--
-- Before running this, store two secrets once in the SQL editor:
--   select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET env var>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'home-brain-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/engine/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Keep history small.
select cron.schedule('home-brain-cleanup', '17 3 * * *', $$
  delete from public.jobs where status in ('done', 'failed') and created_at < now() - interval '14 days';
  delete from cron.job_run_details where end_time < now() - interval '3 days';
$$);
