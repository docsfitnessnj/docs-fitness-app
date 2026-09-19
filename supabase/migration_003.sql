-- Doc's Fitness — migration 003
-- ============================================================================
-- Combined round: SHOW TOMORROW'S WORKOUT (Monthly Unlimited setting) and
-- the COW CHAMP badge (awarded automatically when a Weekly Challenge week
-- closes). Run this AFTER supabase/setup.sql. Safe to run once, and safe to
-- re-run.
--
-- NOTE: the "create extension pg_cron" statement near the bottom usually
-- needs pg_cron turned on from the Supabase dashboard first (Database ->
-- Extensions -> pg_cron) — Doc likely doesn't have permission to enable an
-- extension from plain SQL. If that statement errors, enable pg_cron there,
-- then re-run just this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SHOW TOMORROW'S WORKOUT (Settings & Notifications > IN PERSON)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists show_tomorrows_workout boolean not null default true;

-- ----------------------------------------------------------------------------
-- CHALLENGES — mirrors a published Weekly Challenge's title/scoring/week
-- window from Doc's (otherwise device-only) Content Library, so the COW
-- CHAMP award job below can run without any client needing to be open.
-- ----------------------------------------------------------------------------
create table if not exists public.challenges (
  id text primary key,
  title text not null,
  scoring_type text not null check (scoring_type in ('time', 'rounds', 'rounds_reps')),
  week_start timestamptz not null,
  week_end timestamptz not null,
  champion_awarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

drop policy if exists "challenges are readable by any signed-in member" on public.challenges;
create policy "challenges are readable by any signed-in member"
  on public.challenges for select
  to authenticated
  using (true);

drop policy if exists "only admin can add a challenge" on public.challenges;
create policy "only admin can add a challenge"
  on public.challenges for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can update a challenge" on public.challenges;
create policy "only admin can update a challenge"
  on public.challenges for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- Let badge_grants accept 'cow_champ' (permanent, stackable — see
-- setup.sql's comment above the badge_grants table for the full model).
-- ----------------------------------------------------------------------------
alter table public.badge_grants drop constraint if exists badge_grants_badge_id_check;
alter table public.badge_grants
  add constraint badge_grants_badge_id_check check (
    badge_id in ('joker', 'on_fire', 'cow_killer', 'the_regular', 'day_one_doug', 'hundred_down', 'cow_champ')
  );

-- ----------------------------------------------------------------------------
-- COW CHAMP award — backend logic tied to the Monday week rollover, not
-- client code. See setup.sql for the fuller explanation of each piece.
-- ----------------------------------------------------------------------------
create or replace function public.cow_champ_sort_value(
  p_scoring_type text, p_time_taken text, p_rounds text, p_reps text
) returns numeric
language plpgsql
immutable
as $$
declare
  colon_match text[];
begin
  if p_scoring_type = 'time' then
    colon_match := regexp_match(trim(coalesce(p_time_taken, '')), '^(\d+):(\d{1,2})$');
    if colon_match is not null then
      return colon_match[1]::numeric * 60 + colon_match[2]::numeric;
    end if;
    begin
      return trim(p_time_taken)::numeric;
    exception when others then
      return 'infinity'::numeric;
    end;
  else
    declare
      rounds_num numeric;
      reps_num numeric;
    begin
      begin
        rounds_num := trim(p_rounds)::numeric;
      exception when others then
        return '-infinity'::numeric;
      end;
      begin
        reps_num := trim(coalesce(p_reps, '0'))::numeric;
      exception when others then
        reps_num := 0;
      end;
      return rounds_num * 1000 + reps_num;
    end;
  end if;
end;
$$;

create or replace function public.award_cow_champ_for_closed_challenges()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  best_value numeric;
begin
  for c in
    select * from public.challenges
    where week_end <= now() and champion_awarded_at is null
  loop
    if c.scoring_type = 'time' then
      select min(public.cow_champ_sort_value(c.scoring_type, time_taken, rounds, reps))
        into best_value
      from public.challenge_entries
      where challenge_title = c.title
        and created_at >= c.week_start and created_at < c.week_end;
    else
      select max(public.cow_champ_sort_value(c.scoring_type, time_taken, rounds, reps))
        into best_value
      from public.challenge_entries
      where challenge_title = c.title
        and created_at >= c.week_start and created_at < c.week_end;
    end if;

    if best_value is not null and best_value not in ('infinity'::numeric, '-infinity'::numeric) then
      insert into public.badge_grants (user_id, badge_id, period_key)
      select distinct user_id, 'cow_champ', c.id
      from public.challenge_entries
      where challenge_title = c.title
        and created_at >= c.week_start and created_at < c.week_end
        and public.cow_champ_sort_value(c.scoring_type, time_taken, rounds, reps) = best_value
      on conflict (user_id, badge_id, period_key) do nothing;
    end if;

    update public.challenges set champion_awarded_at = now() where id = c.id;
  end loop;
end;
$$;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into existing_job_id from cron.job where jobname = 'award-cow-champ-weekly';
    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;
    perform cron.schedule(
      'award-cow-champ-weekly',
      '5 0 * * 1',
      $cron$select public.award_cow_champ_for_closed_challenges();$cron$
    );
  end if;
end;
$$;
