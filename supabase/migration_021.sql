-- Doc's Fitness — migration 021
-- ============================================================================
-- Kettlebell size is free text, not a number.
--
-- Real report: typing "2x24" or adding "kg" in the kettlebell field wiped
-- it. Root cause: `kettlebell_kg` is a NUMERIC column in both
-- `wod_completions` and `challenge_entries`. The client was converting
-- whatever was typed through `Number(...)`, which is `NaN` for anything
-- that isn't a bare number — that got coerced to null before ever reaching
-- the database, and the next read-back (sometimes live, mid-keystroke, when
-- editing an already-completed day's results) showed that null as an empty
-- field. A kettlebell size is routinely written as "2x24", "16/20",
-- "24kg", or in pounds — never reliably just a number — so the column
-- itself needs to hold free text, not force a numeric parse.
--
-- This widens the column in place (ALTER COLUMN ... TYPE text USING
-- kettlebell_kg::text converts existing numeric values to their plain text
-- form, e.g. 16 -> '16' — no data loss for every entry logged until now,
-- since they were all plain numbers to begin with). Nothing else in this
-- schema reads kettlebell_kg as a number (no CHECK constraint, no
-- arithmetic, no averaging) — grep of supabase/ and src/ confirms every
-- consumer already only ever displays it as a string.
--
-- Run this AFTER migration_020.sql. Safe to run once, and safe to re-run —
-- altering a column to the type it's already in is a harmless no-op.
-- ============================================================================

alter table public.wod_completions
  alter column kettlebell_kg type text using kettlebell_kg::text;

alter table public.challenge_entries
  alter column kettlebell_kg type text using kettlebell_kg::text;
