-- Invokes the deliver-notifications edge function every minute.
-- Run this ONCE in the Supabase SQL editor. It needs the service_role key,
-- which is stored in Vault (never inlined into the cron definition or git).
--
-- Steps:
--   1. Replace <SERVICE_ROLE_KEY> below with the project's service_role key
--      (Dashboard -> Project Settings -> API -> service_role, secret).
--   2. Run the whole file.

-- Schedulers
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the service_role key in Vault (idempotent: replace if it already exists).
delete from vault.secrets where name = 'notif_service_key';
select vault.create_secret('<SERVICE_ROLE_KEY>', 'notif_service_key');

-- Unschedule a previous version if re-running.
select cron.unschedule('deliver-notifications')
where exists (select 1 from cron.job where jobname = 'deliver-notifications');

-- Fire the function every minute.
select cron.schedule(
  'deliver-notifications',
  '* * * * *',
  $$
    select net.http_post(
      url     := 'https://yqcwvpwzykawwndbyakw.supabase.co/functions/v1/deliver-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'notif_service_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Verify:  select jobname, schedule, active from cron.job;
