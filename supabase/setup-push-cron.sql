-- Run this in the Supabase SQL editor AFTER you've set the Edge Function secrets
-- (FCM_SERVICE_ACCOUNT and CRON_SECRET). It schedules the attendance-push
-- function to run daily. Replace <CRON_SECRET> with the same value you set as
-- the CRON_SECRET Edge Function secret.
--
-- Project ref is already filled in for this project (jlueyxbqknnmcoesgnmg).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous copy of the job before (re)creating it.
select cron.unschedule('attendance-push-daily')
where exists (select 1 from cron.job where jobname = 'attendance-push-daily');

-- 13:30 UTC = 19:00 IST, once a day. Adjust the cron expression to taste.
select cron.schedule(
  'attendance-push-daily',
  '30 13 * * *',
  $$
  select net.http_post(
    url     := 'https://jlueyxbqknnmcoesgnmg.supabase.co/functions/v1/attendance-push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To inspect runs:   select * from cron.job_run_details order by start_time desc limit 20;
-- To remove the job:  select cron.unschedule('attendance-push-daily');
