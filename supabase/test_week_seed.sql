-- ============================================================================
-- Round 47 — TEST SEED, NOT a numbered migration.
--
-- Do NOT rename this into migration_0NN.sql. Do NOT add any of this to
-- setup.sql. This exists for exactly one purpose: a live trial of the
-- Sunday 6:00pm ET automatic content release, tonight, Sunday November 8,
-- 2026, using real content that already exists in the app.
--
-- Run this AFTER migration_031.sql, so tonight's post has tappable
-- workout/COW names. If it's run WITHOUT migration_031.sql, the release
-- still fires right on schedule and the pinned post still goes out — it
-- just lists these same 5 names as plain, non-tappable text. Nothing
-- fails, nothing is blocked, either way.
--
-- week_start_date below is Monday, November 9, 2026 — scheduled_weeks'
-- own generated `release_at` column resolves that to Sunday, November 8,
-- 2026, 6:00pm ET: tonight. pg_cron's `release-scheduled-weeks-check` job
-- (migration_030.sql) runs every 15 minutes and will pick this week up
-- the first time it finds release_at <= now() — no manual trigger needed,
-- that's the whole point of tonight's trial.
--
-- Every workout below is copied verbatim (real name, format, movements,
-- and — where one exists — real breakdown video) from content already
-- shipped in this app:
--   - MON "Jen Loves Counting", TUE "Just Do It", THU "Two Minutes Or
--     Less", FRI "Basic And Complex" — all 4 are real Deck of WODs cards
--     (src/data/deckCards.ts), each with a real, owner-verified YouTube
--     breakdown video (Round 41's own exhaustive video-matching pass).
--   - COW "Pull Yourself Together" — the real, already-seeded Challenge
--     of the Week (src/data/contentLibrarySeed.ts, Round 39), with its
--     real video and its structured fields flattened into
--     scheduled_cows' own flat columns (kettlebells / the_work /
--     the_catch / finish_note — see migration_030.sql's own comment on
--     why that table is flatter than the local Content Library's rich
--     COW shape).
--
-- Fixed ids below so the cleanup block at the bottom of this file can
-- remove exactly this test data and nothing else.
-- ============================================================================

insert into public.scheduled_weeks (id, week_start_date)
values ('a0000000-0000-4000-8000-000000000001', date '2026-11-09')
on conflict (week_start_date) do nothing;

insert into public.scheduled_wods (id, week_id, day_of_week, name, format, movements, video_url)
values
  (
    'a0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'mon',
    'Jen Loves Counting',
    'For Time or Take Your Time! Rep Ladder 24_20_16_12_8_4',
    array['Swing + Clean + Squats', 'Elevators (total)', 'Bear squat hops', 'L/R Suitcase Dead (total)', 'L/R Hinge Rows (total)'],
    'https://www.youtube.com/watch?v=328xQCWQJlo'
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'tue',
    'Just Do It',
    '30min AMQRAP (As Many Quality Rounds As Possible)',
    array['15 Swings', '5 Goblet Squats', '5 Goblet Curl + Goblet Press', '20 Jump Lunges', '10 Burpees'],
    'https://www.youtube.com/watch?v=YWH0-FH7HfY'
  ),
  (
    'a0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    'thu',
    'Two Minutes Or Less',
    '30min E2MOM (Every 2 Minutes On the Minute), 5 Rounds',
    array['Min 1/2: 10 Cali Swings + 5 FT Press + 5 Burpee Bell Hops', 'Min 3/4: Perform 1:30 of one of the following cardio movements: Erg, Assault Bike, Sled, Burpees', 'Min 5/6: Between 1:30-2min Low Plank'],
    'https://www.youtube.com/watch?v=ZWfz0Ya-TOY'
  ),
  (
    'a0000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001',
    'fri',
    'Basic And Complex',
    '30min AMCAP, Right Side then Left Side',
    array['5 Clean & Squats', '4 Rev. Lg + KD', '3 Push Press', '2 Thrusters', '1 TGD'],
    'https://www.youtube.com/watch?v=Pv6Lvr_2UfM'
  )
on conflict (week_id, day_of_week) do nothing;

insert into public.scheduled_cows (id, week_id, name, video_url, scoring_type, kettlebells, the_work, the_catch, finish_note)
values (
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000001',
  'Pull Yourself Together',
  'https://youtu.be/uYRgU5aM4MU',
  'time',
  E'DUDES: Rx 32kg / Scaled 28kg / Modified 24kg\nFEMALES: Rx 24kg / Scaled 20kg / Modified 16kg',
  E'50 Pull Ups, for time.\nSubs: 75 Band Assisted Pull Ups / 100 TRX Table Top Rows / 150 Bent Rows (75/75)',
  E'Every time you drop off the bar, pay the toll:\n8 Swings\n6 Thrusters\n4/4 Goblet Reverse Lunges\n2 Burpees\nThen get back on the bar right where you left off. Bent rows: the toll fires every time you finish one side.',
  'Your time stops when you finish the toll after your final pull up. The last move you do is a burpee.'
)
on conflict (week_id) do nothing;

-- ============================================================================
-- CLEANUP — run this AFTER tonight's trial, once the owner is done
-- watching the release happen. Commented out on purpose; uncomment and
-- run as its own statement(s) when ready.
--
-- Deleting the scheduled week cascades (on delete cascade) to its own
-- scheduled_wods and scheduled_cows rows automatically — no separate
-- delete needed for those. The second statement removes the automatic
-- pinned "THE NEW WEEK IS LIVE" post(s) the trial's own release created.
-- ============================================================================

-- delete from public.scheduled_weeks where id = 'a0000000-0000-4000-8000-000000000001';
-- delete from public.community_posts where is_weekly_release = true;
