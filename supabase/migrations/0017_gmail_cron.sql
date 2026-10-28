-- Gmail scanning runs on its own schedule instead of inside the minute tick
-- (roadmap 0.4), so a slow inbox can't hold up reminders or hit the tick's limit.
-- Uses the same Vault secrets as home-brain-tick (0003_cron.sql).

select cron.schedule(
  'home-brain-gmail',
  '7,37 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/gmail',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
