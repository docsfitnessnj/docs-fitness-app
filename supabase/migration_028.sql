-- Doc's Fitness — migration 028
-- ============================================================================
-- Round 44: STRUCTURED LOGGING + PB DETECTION
--
-- Four independent, additive changes, all idempotent (safe to run once, and
-- safe to re-run — every statement below is a no-op the second time):
--
-- 1. wod_completions gains the fields a richer Log Results form needs:
--    `reps` (an overall AMRAP partial-reps count, alongside the existing
--    `rounds`), `movement_weights` (one JSONB map per completion, keyed by
--    movement identity — see the key-scheme note below), and `is_pb` (a
--    personal-best flag, computed and written by the client at save time —
--    see Part 3's own note below on why this is persisted rather than only
--    computed live).
--
-- 2. deck_completions, which today carries only `user_id`/`card_id`/
--    `completed_at` (a binary MARK COMPLETE, nothing else), is widened to
--    the SAME results shape wod_completions already has — `rounds`,
--    `time_taken`, `kettlebell_kg`, `notes`, `media_url`, `media_type` —
--    plus this round's own `reps`/`movement_weights`/`is_pb`. Deck cards get
--    a real Log Results form for the first time this round, reusing the
--    exact same component the WOD path already has; see AGENTS.md's Round
--    44 writeup for the full "this didn't exist before" account.
--
-- 3. challenges.scoring_type's check constraint widens to allow 'emom' — an
--    endless-EMOM Challenge scores on completed minutes plus the reps
--    reached in the minute the member broke, the exact same "bigger number,
--    then reps as tiebreaker" shape 'rounds_reps' (AMRAP) already uses.
--    challenge_entries itself needs NO new column for this: an EMOM entry
--    simply stores its completed-minutes count in the existing `rounds`
--    column and its partial reps in the existing `reps` column — only the
--    member-facing labels change (MINUTES / REPS instead of ROUNDS / +REPS).
--    challenge_entries gains `is_pb`, same reasoning as wod_completions.
--
-- 4. community_posts gains `is_pb` — the one flag that MUST be persisted
--    regardless of the above, since another member's feed has no way to
--    recompute a PB from the poster's own private completion history; it's
--    written once, by the posting member's own client, at POST TO COMMUNITY
--    time.
--
-- Movement weight KEY SCHEME (not a schema concern, but worth recording
-- here since it's exactly what `movement_weights`' own keys look like):
-- each movement line is run through the app's existing Movement Vault
-- matcher (movementMatcher.ts's findMovementInText, the same code that
-- already powers "tap a movement name" everywhere else in this app) — a
-- real match keys the entry `movement:<vault id>` (so "Swings" and
-- "Kettlebell Swings" correctly prefill from each other and roll up
-- together for a future recap); no match falls back to `raw:<normalized
-- text>` (e.g. a card's own flavor line that isn't a real movement at all).
-- See src/lib/movementWeights.ts.
-- ============================================================================

alter table public.wod_completions
  add column if not exists reps text,
  add column if not exists movement_weights jsonb not null default '{}'::jsonb,
  add column if not exists is_pb boolean not null default false;

alter table public.deck_completions
  add column if not exists rounds text not null default '',
  add column if not exists time_taken text not null default '',
  add column if not exists kettlebell_kg text,
  add column if not exists reps text,
  add column if not exists notes text not null default '',
  add column if not exists media_url text,
  add column if not exists media_type text check (media_type in ('image', 'video')),
  add column if not exists movement_weights jsonb not null default '{}'::jsonb,
  add column if not exists is_pb boolean not null default false;

alter table public.challenge_entries
  add column if not exists is_pb boolean not null default false;

alter table public.community_posts
  add column if not exists is_pb boolean not null default false;

-- challenges.scoring_type's check constraint was declared inline in the
-- original CREATE TABLE (migration_003.sql), so Postgres auto-named it --
-- found here by querying pg_constraint for whichever check constraint
-- actually covers this column, rather than assuming its generated name,
-- so this still works correctly even if a future Postgres version or a
-- differently-bootstrapped database happened to name it something else.
-- Re-running this is a genuine no-op: the second run finds the
-- `challenges_scoring_type_check` constraint this block itself created,
-- drops it, and re-adds the byte-identical definition.
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'challenges'
    and att.attname = 'scoring_type'
    and con.contype = 'c'
    and con.conrelid = 'public.challenges'::regclass
  limit 1;

  if existing_constraint is not null then
    execute format('alter table public.challenges drop constraint %I', existing_constraint);
  end if;

  alter table public.challenges add constraint challenges_scoring_type_check
    check (scoring_type in ('time', 'rounds', 'rounds_reps', 'emom'));
end $$;
