-- ============================================================================
-- Round 25: default class capacity 30 -> 50 (the room's real maximum), for
-- all four regular classes (Dawn Patrol, Yawn Patrol x2, Savage Saturday) --
-- existing generated sessions AND the template default future sessions
-- inherit. Downbeach Pilates stays uncapped (is_guest_class = true, never
-- touched here). Per-class admin editing (admin_update_template_capacity,
-- migration_023) is completely unchanged by this -- it still works exactly
-- as built, just starting from a 50 baseline instead of 30 from now on.
--
-- Idempotent and safe to re-run: every WHERE clause targets an exact prior
-- value, so a second run is a genuine no-op (0 rows match), never a second
-- unintended write.
-- ============================================================================

update public.class_templates
set default_capacity = 50
where class_key in ('mwf-530a', 'mwf-930a', 'tth-930a', 'sat-815a')
  and default_capacity = 30;

-- Same session_date >= current_date scoping admin_update_template_capacity
-- itself already uses -- a class that already happened has no reason to
-- have its historical capacity rewritten.
update public.class_sessions
set capacity = 50
where class_key in ('mwf-530a', 'mwf-930a', 'tth-930a', 'sat-815a')
  and capacity = 30
  and session_date >= current_date;
