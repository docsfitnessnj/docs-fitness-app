-- ============================================================================
-- Round 26: Downbeach Pilates's own class TYPE label (the small gray line
-- under its class name/time -- "Pilates") renamed to "Group Mat Pilates".
-- The class NAME ("Downbeach Pilates with Marina") is untouched; only the
-- class_type value changes. Same two-part pattern as migration_024's
-- capacity bump: the template (so every future-generated session inherits
-- the new label) AND every already-generated, not-yet-happened session
-- (so a member doesn't see a stale label on a class they could still book
-- today).
--
-- The check constraint on class_templates.class_type has to be widened
-- first -- it still only allows the old 'Pilates' value -- before the
-- update statement below can write 'Group Mat Pilates' into it.
-- class_sessions.class_type carries no check constraint of its own (it's
-- a plain snapshot column), so nothing to widen there.
--
-- Idempotent and safe to re-run: the constraint drop+add always lands on
-- the exact same final definition regardless of how many times it runs,
-- and both UPDATEs are scoped to the exact prior value ('Pilates'), so a
-- second run matches 0 rows and changes nothing further.
-- ============================================================================

-- Drop the old constraint FIRST, then write the new value, then add the
-- new (narrower) constraint back -- adding a CHECK constraint validates
-- every existing row immediately (it's not NOT VALID), so doing this in
-- the other order would fail on the still-'Pilates' row that hasn't been
-- updated yet.
alter table public.class_templates drop constraint if exists class_templates_class_type_check;

update public.class_templates
set class_type = 'Group Mat Pilates'
where class_key = 'pilates-wed-830a'
  and class_type = 'Pilates';

-- Same session_date >= current_date scoping migration_024/
-- admin_update_template_capacity already use -- a class that already
-- happened has no reason to have its historical record rewritten.
update public.class_sessions
set class_type = 'Group Mat Pilates'
where class_key = 'pilates-wed-830a'
  and class_type = 'Pilates'
  and session_date >= current_date;

alter table public.class_templates
  add constraint class_templates_class_type_check
  check (class_type in ('Kettlebell Strength', 'Kettlebell Cardio', 'Hybrid', 'Group Mat Pilates'));
