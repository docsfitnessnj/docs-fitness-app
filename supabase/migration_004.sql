-- Doc's Fitness — migration 004
-- ============================================================================
-- Reschedules the COW CHAMP award job for the new Weekly Challenge rhythm:
-- challenges now close Saturday 12:00pm ET instead of resetting Monday, and
-- the next one can go live Sunday 6:00pm ET. No table or column changes —
-- `challenges.week_start`/`week_end` and award_cow_champ_for_closed_challenges()
-- already work for any close time, since the app itself now writes the
-- correct Sat-noon-ET/Sun-6pm-ET instants into those columns (see
-- src/lib/challengeSchedule.ts). This migration only reschedules the
-- pg_cron job that calls that function.
--
-- Run this AFTER supabase/setup.sql and migration_003.sql. Safe to run
-- once, and safe to re-run.
--
-- NOTE: same as migration_003.sql, the "create extension pg_cron" statement
-- below usually needs pg_cron turned on from the Supabase dashboard first
-- (Database -> Extensions -> pg_cron). If it errors, enable it there, then
-- re-run just this file.
-- ============================================================================

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Drop the old once-a-week Monday job this replaces, if present.
    select jobid into existing_job_id from cron.job where jobname = 'award-cow-champ-weekly';
    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    -- Reschedule (or first-time schedule) the frequent check. Running every
    -- 15 minutes, year round, means the real close instant recorded in
    -- `challenges.week_end` (already correct for EDT or EST, whichever is
    -- in effect) is always caught within 15 minutes, without hardcoding a
    -- UTC cron time that would drift an hour off twice a year at each
    -- Daylight Saving change.
    select jobid into existing_job_id from cron.job where jobname = 'award-cow-champ-check';
    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;
    perform cron.schedule(
      'award-cow-champ-check',
      '*/15 * * * *',
      $cron$select public.award_cow_champ_for_closed_challenges();$cron$
    );
  end if;
end;
$$;
