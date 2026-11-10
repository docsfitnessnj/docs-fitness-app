-- Round 48 — release post format v2: a real YOUR WORKOUTS schedule, one
-- line per weekday with its own day name and date, a fixed Wednesday
-- DOC'S COW line, and a closer line that rotates through a fixed 6-line
-- library, one per real release.
--
-- Everything the owner tested from Round 47's own live trial stays true
-- here: this is still a plain `create or replace function` on
-- release_scheduled_weeks_if_due() (migration_030.sql/migration_031.sql),
-- the function's own name/args/return type unchanged, safe to run any
-- number of times, and neither of those two earlier migration files is
-- touched (migration files are historical, never retroactively edited).
--
-- THE NEW POST BODY, TOP TO BOTTOM (owner's own exact copy):
--   THE NEW WEEK IS LIVE
--
--   YOUR WORKOUTS
--
--   MONDAY 11/10/26: [name]
--   TUESDAY 11/11/26: [name]
--   WEDNESDAY 11/12/26: DOC'S COW · [name] (THE CHALLENGE OF THE WEEK)
--   THURSDAY 11/13/26: [name]
--   FRIDAY 11/14/26: [name]
--
--   <one of six fixed closer lines, rotating>
--
-- THE LINK FORMAT, widened from Round 47. Round 47's own shape made the
-- WHOLE line a link (`<name>|wod:YYYY-MM-DD>` / `<name>|cow`) -- this
-- round needs a tappable name embedded in the MIDDLE of a line, with real
-- plain text both before it (the day/date prefix) and, on the Wednesday
-- line, after it too (the "(THE CHALLENGE OF THE WEEK)" parenthetical).
-- `[[`/`]]` mark the tappable name's own start/end; the `|wod:.../|cow`
-- suffix at the line's own end still carries the navigation target,
-- unchanged. src/lib/weeklyReleaseLinks.ts's parseReleaseLineSegments()
-- reads this shape FIRST, falls back to Round 47's whole-line shape
-- SECOND (so a post written before this migration ran still renders its
-- own name as a real link, not broken text), and falls back to plain,
-- non-tappable text for anything else (an ordinary member's own post, or
-- a post from before migration_031.sql ever existed) -- exactly the same
-- "nothing can break" guarantee Round 47 already established, now with
-- one more fallback rung.
--
-- THE CLOSER ROTATION. scheduled_week_closer_index() returns how many
-- weeks this table has already released BEFORE the one currently being
-- processed -- a plain count of `released_at is not null` rows, read
-- before this loop iteration marks its own week released. That number,
-- mod 6, is a position in the fixed 6-line array below: the very first
-- release this table's history ever produces gets closer #1, the second
-- gets #2, and so on, wrapping after #6 -- with nothing new to persist,
-- since `released_at` (already the idempotency flag every release
-- function in this app relies on) is itself the rotation's whole memory.
-- The closer library is a fixed array literal inside the function body,
-- never a table, per the brief's own "never generated at runtime"
-- instruction.
-- ----------------------------------------------------------------------------
create or replace function public.scheduled_week_date_label(d date)
returns text
language sql
immutable
as $$
  select trim(leading '0' from to_char(d, 'MM')) || '/' || trim(leading '0' from to_char(d, 'DD')) || '/' || to_char(d, 'YY');
$$;

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
  mon_wod record;
  tue_wod record;
  thu_wod record;
  fri_wod record;
  closer_idx int;
  closer text;
  wed_date date;
  wed_line text;
  wod_lines text;
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
    select count(*) into closer_idx from public.scheduled_weeks where released_at is not null;
    closer := (array[
      'Start your week off strong.',
      'Never miss a Monday.',
      'The 2x Wednesday Protocol: get 2 workouts in by Wednesday. Any 2 count.',
      'See you Monday morning.',
      'The board runs on your wins. Post them.',
      'New week, clean slate. Badges reset Monday. Earn them again.'
    ])[(closer_idx % 6) + 1];

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

    select * into mon_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'mon';
    select * into tue_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'tue';
    select * into thu_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'thu';
    select * into fri_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'fri';

    -- The Wednesday line always reads DOC'S COW, per the brief — a
    -- scheduled week with no COW row at all (shouldn't happen in real
    -- operation, but not structurally impossible) falls back to the same
    -- fixed label with no link rather than a broken or empty line.
    wed_date := w.week_start_date + 2;
    if cow.id is not null then
      wed_line := 'WEDNESDAY ' || public.scheduled_week_date_label(wed_date) || ': DOC''S COW · [[' || cow.name || ']] (THE CHALLENGE OF THE WEEK)|cow';
    else
      wed_line := 'WEDNESDAY ' || public.scheduled_week_date_label(wed_date) || ': DOC''S COW';
    end if;

    wod_lines := '';
    if mon_wod.id is not null then
      wod_lines := wod_lines || 'MONDAY ' || public.scheduled_week_date_label(w.week_start_date) || ': [[' || mon_wod.name || ']]|wod:' || to_char(w.week_start_date, 'YYYY-MM-DD') || E'\n';
    end if;
    if tue_wod.id is not null then
      wod_lines := wod_lines || 'TUESDAY ' || public.scheduled_week_date_label(w.week_start_date + 1) || ': [[' || tue_wod.name || ']]|wod:' || to_char(w.week_start_date + 1, 'YYYY-MM-DD') || E'\n';
    end if;
    wod_lines := wod_lines || wed_line || E'\n';
    if thu_wod.id is not null then
      wod_lines := wod_lines || 'THURSDAY ' || public.scheduled_week_date_label(w.week_start_date + 3) || ': [[' || thu_wod.name || ']]|wod:' || to_char(w.week_start_date + 3, 'YYYY-MM-DD') || E'\n';
    end if;
    if fri_wod.id is not null then
      wod_lines := wod_lines || 'FRIDAY ' || public.scheduled_week_date_label(w.week_start_date + 4) || ': [[' || fri_wod.name || ']]|wod:' || to_char(w.week_start_date + 4, 'YYYY-MM-DD') || E'\n';
    end if;

    post_body := 'THE NEW WEEK IS LIVE' || E'\n\n' || 'YOUR WORKOUTS' || E'\n\n' || rtrim(wod_lines, E'\n') || E'\n\n' || closer;

    insert into public.community_posts (author_id, title, body, kind, pinned, is_weekly_release)
    values (admin_id, '', post_body, 'text', true, true);

    -- A future round can add a transactional-email hook right here (same
    -- loop iteration, same "this week just went live" instant) without any
    -- restructuring — everything this round builds already resolves "the
    -- week that just released" and "who to notify" at exactly this point.
  end loop;
end;
$$;
