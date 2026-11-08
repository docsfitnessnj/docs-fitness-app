-- Round 47 — clickable workout/COW names in the automatic Sunday-night
-- release post.
--
-- release_scheduled_weeks_if_due() (migration_030.sql) builds its post
-- body from plain workout names only — no COW name in it at all, and no
-- way for the client to know which name belongs to which calendar day.
-- Job 1 of this round needs each of the 4 WOD names, and the COW name,
-- to be individually tappable in the real posted copy: a WOD name goes
-- straight to that exact day's workout, the COW name straight to the
-- COW room.
--
-- The fix is a plain, human-readable per-line suffix, not a second data
-- channel: each WOD line in the post body becomes
--   <name>|wod:<YYYY-MM-DD>
-- (the WOD's own real calendar date, computed from week_start_date plus
-- that day's offset — mon/tue/thu/fri = +0/+1/+3/+4 days). The COW line
-- becomes
--   <name>|cow
-- src/lib/weeklyReleaseLinks.ts parses this on the client and
-- WeeklyReleasePostBody.tsx renders the name (suffix stripped) as a real
-- tappable Text — navigateToTab('DocsWods', { jumpToDate }) for a WOD,
-- navigateToTab('DocsCows') for the COW. PostCard's own truncated 3-line
-- preview and PostDetailModal's full view both go through the same
-- renderer, gated on community_posts.is_weekly_release so an ordinary
-- member's own post (which could in principle contain a literal "|") is
-- never run through this parser.
--
-- Deliberately, fully backward compatible: this is a plain
-- `create or replace function` — the function's own name, arguments, and
-- return type are unchanged, so this migration is safe to run any number
-- of times, and never touches migration_030.sql itself (migration files
-- are historical, never retroactively edited). If this migration is
-- never run at all, the OLD function keeps working exactly as it already
-- does today — plain names, no COW line, no suffix — and the client's
-- own parser simply finds no matching suffix on any line, rendering
-- every name as ordinary, non-tappable text. Nothing breaks either way:
-- running supabase/test_week_seed.sql without this migration first still
-- produces a real pinned post tonight, it just lists plain text names.
-- ----------------------------------------------------------------------------
create or replace function public.release_scheduled_weeks_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  admin_id uuid;
  cow record;
  wod_names text;
  post_body text;
begin
  select id into admin_id from public.profiles where is_admin = true order by created_at asc limit 1;
  if admin_id is null then
    return;
  end if;

  for w in
    select * from public.scheduled_weeks
    where release_at <= now() and released_at is null
    order by release_at asc
  loop
    update public.scheduled_weeks set released_at = now() where id = w.id;

    -- Mirror this week's COW into challenges — the same shape the client's
    -- own best-effort local mirror already writes for a Content-Library-
    -- published Challenge, so award_cow_champ_for_closed_challenges() (and
    -- the live leaderboard's own scoring) keep working unmodified for a
    -- scheduled-system COW too. week_start_date + 5 = Saturday of this
    -- same week; noon ET that day is always the real close instant.
    select * into cow from public.scheduled_cows where week_id = w.id;
    if cow.id is not null then
      insert into public.challenges (id, title, scoring_type, week_start, week_end)
      values (
        w.id::text,
        cow.name,
        cow.scoring_type,
        w.release_at,
        ((w.week_start_date + 5) + time '12:00') at time zone 'America/New_York'
      )
      on conflict (id) do update set
        title = excluded.title,
        scoring_type = excluded.scoring_type,
        week_start = excluded.week_start,
        week_end = excluded.week_end;
    end if;

    -- Unpin the previous auto-release post (there is at most one at a
    -- time) before inserting the new one, to stay under the 3-pin cap.
    update public.community_posts set pinned = false where is_weekly_release = true and pinned = true;

    -- Round 47 — each WOD line now carries its own real calendar date as
    -- a `|wod:YYYY-MM-DD` suffix, so the client can resolve "this name"
    -- to "that exact day" with no second lookup.
    select string_agg(
      name || '|wod:' || to_char(
        w.week_start_date + case day_of_week
          when 'mon' then 0 when 'tue' then 1 when 'thu' then 3 when 'fri' then 4
        end,
        'YYYY-MM-DD'
      ),
      E'\n' order by
      case day_of_week when 'mon' then 1 when 'tue' then 2 when 'thu' then 3 when 'fri' then 4 end)
      into wod_names
    from public.scheduled_wods
    where week_id = w.id;

    post_body := 'THE NEW WEEK IS LIVE. Fresh WODs and a new COW just dropped. See you Monday morning.'
      || case when wod_names is not null then E'\n\n' || wod_names else '' end
      || case when cow.id is not null then E'\n' || cow.name || '|cow' else '' end;

    insert into public.community_posts (author_id, title, body, kind, pinned, is_weekly_release)
    values (admin_id, '', post_body, 'text', true, true);

    -- A future round can add a transactional-email hook right here (same
    -- loop iteration, same "this week just went live" instant) without any
    -- restructuring — everything this round builds already resolves "the
    -- week that just released" and "who to notify" at exactly this point.
  end loop;
end;
$$;
