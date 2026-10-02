-- Run once in the Supabase SQL editor after deploying to Vercel.
-- Calls the job tick every minute (reminders, follow-up scans, retries) and keeps the free project awake.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace the URL and secret with your values (JOBS_TICK_SECRET in Vercel).
select cron.schedule(
  'ile-jobs-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/jobs/tick',
    headers := jsonb_build_object('authorization', 'Bearer YOUR_JOBS_TICK_SECRET', 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- To stop: select cron.unschedule('ile-jobs-tick');
