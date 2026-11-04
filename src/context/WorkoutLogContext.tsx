import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { MediaAttachment } from '../lib/media';
import { checkPersonalBest } from '../lib/personalBest';
import { loadJSON, saveJSON } from '../lib/storage';
import { describeChatFailure, isBackendUnavailableError, supabase } from '../lib/supabaseClient';

// Draft log text (rounds/time/kettlebell/notes/media) while a WOD is still
// in progress stays local-only — nobody else needs to see a result you
// haven't marked complete yet, and it means typing doesn't round-trip to
// the server on every keystroke. The moment a day is marked complete, its
// snapshot is written to `wod_completions` and becomes the shared, durable
// record — see toggleCompleted below.
const DRAFT_LOGS_STORAGE_KEY = 'docsfitness.workoutLogDrafts.v1';

export type WorkoutLog = {
  rounds: string;
  // Round 44 — an overall AMRAP partial-reps count, alongside `rounds`.
  // Optional, free text, same convention as every other score field.
  reps: string;
  time: string;
  kettlebell: string;
  notes: string;
  media: MediaAttachment | null;
};

export type CompletedWorkout = {
  dayKey: string;
  workoutTitle: string;
  dateLabel: string;
  timestamp: number;
  completedAt: number;
  log: WorkoutLog;
  // Round 44 — computed and persisted at save time (see syncCompletedRow /
  // toggleCompleted below); never recomputed here on read, so this is
  // exactly what was true the moment this entry was last saved.
  isPb: boolean;
};

export const EMPTY_WORKOUT_LOG: WorkoutLog = {
  rounds: '',
  reps: '',
  time: '',
  kettlebell: '',
  notes: '',
  media: null,
};

// Kettlebell size is free text ("2x24", "16/20", "24kg", plain pounds —
// never reliably just a number), so nothing here appends a unit of its
// own on top of whatever was actually typed.
export function formatLogSummary(log: WorkoutLog): string {
  const parts = [
    log.rounds.trim() && `Rounds: ${log.rounds.trim()}${log.reps.trim() ? ` +${log.reps.trim()}` : ''}`,
    log.time.trim() && `Time: ${log.time.trim()}`,
    log.kettlebell.trim() && `KB: ${log.kettlebell.trim()}`,
  ].filter(Boolean) as string[];
  const summary = parts.join(' · ');
  if (log.notes.trim()) {
    return summary ? `${summary}\n${log.notes.trim()}` : log.notes.trim();
  }
  return summary;
}

// Condensed "RESULTS:" line for a workout post — combines bell size(s) and
// score. Returns undefined when no result fields are filled, since results
// are optional and a post can be subject + notes only.
export function formatResultsLine(log: WorkoutLog): string | undefined {
  const parts = [
    log.kettlebell.trim() && log.kettlebell.trim().toUpperCase(),
    log.rounds.trim() &&
      `${log.rounds.trim().toUpperCase()} ROUNDS${log.reps.trim() ? ` +${log.reps.trim().toUpperCase()}` : ''}`,
    log.time.trim() && log.time.trim().toUpperCase(),
  ].filter(Boolean) as string[];
  if (parts.length === 0) return undefined;
  return `RESULTS: ${parts.join(' · ')}`;
}

type WorkoutLogContextValue = {
  loading: boolean;
  error: string | null;
  getLog: (dayKey: string) => WorkoutLog;
  updateLog: (dayKey: string, field: 'rounds' | 'reps' | 'time' | 'kettlebell' | 'notes', value: string) => void;
  setLogMedia: (dayKey: string, media: MediaAttachment | null) => void;
  isCompleted: (dayKey: string) => boolean;
  toggleCompleted: (dayKey: string, workoutTitle: string, dateLabel: string, timestamp: number) => void;
  completedWorkouts: CompletedWorkout[];
  // A completion write that didn't actually land in the database — surfaced
  // so the screen can show a quiet, honest note instead of leaving the
  // member with a checkmark that silently evaporates the next time they
  // sign in (the root cause this round fixed: these writes used to fire and
  // forget, so a failure left the optimistic local state as the only copy,
  // gone the moment the app re-fetched from the real database). Rolled back
  // automatically on failure — see toggleCompleted/syncCompletedRow below.
  writeError: string | null;
  clearWriteError: () => void;
};

const WorkoutLogContext = createContext<WorkoutLogContextValue | undefined>(undefined);

type Row = {
  day_key: string;
  workout_title: string;
  date_label: string;
  workout_timestamp: number;
  rounds: string;
  // Round 44 — nullable since every pre-existing row predates this column.
  reps: string | null;
  time_taken: string;
  // Free text (migration_021) — "2x24", "16/20", "24kg", or pounds, stored
  // and displayed exactly as typed. Never parsed as a number.
  kettlebell_kg: string | null;
  notes: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  is_pb: boolean;
  completed_at: string;
};

function rowToCompletedWorkout(row: Row): CompletedWorkout {
  return {
    dayKey: row.day_key,
    workoutTitle: row.workout_title,
    dateLabel: row.date_label,
    timestamp: row.workout_timestamp,
    completedAt: new Date(row.completed_at).getTime(),
    log: {
      rounds: row.rounds,
      reps: row.reps ?? '',
      time: row.time_taken,
      kettlebell: row.kettlebell_kg ?? '',
      notes: row.notes,
      media: row.media_url ? { uri: row.media_url, type: row.media_type ?? 'image' } : null,
    },
    isPb: row.is_pb,
  };
}

// Round 44 — "the same workout, logged before, by name" for PB comparison.
// `wod_completions` has always had exactly one row per (user, day_key) —
// day_key is a FIXED weekday slot ('mon'..'fri', or the Saturday key), the
// same slot every calendar week, never a per-date key (see
// useWeekdayWod()/DayPanel.tsx's own dayKey derivation, which this round
// doesn't change) — so there is no accumulated multi-week history to
// search for a recurring title the way a brand-new schema might support.
// The only real "prior" a one-row-per-slot model can ever have is
// whatever was in that exact row immediately before THIS edit — the same
// singleton comparison DeckProgressContext's own priorScoreForCard uses
// for exactly the same reason (deck_completions is also one row per card,
// ever). This is only ever called from syncCompletedRow (editing an
// ALREADY-complete day, so `existing` is genuinely the same workout mid-
// edit) — toggleCompleted's own first-completion path never has an
// `existing` row to pass at all, by construction (it only reaches its
// "new completion" branch when no row exists yet for this dayKey), so a
// brand-new completion correctly can never be a PB on its own first save.
// Round 44.5 (owner decision, final): weight no longer plays any part in
// this comparison, so kettlebell_kg isn't read here at all.
function priorScoreForDayKey(existing: Row) {
  return [{ time: existing.time_taken, rounds: existing.rounds, reps: existing.reps ?? undefined }];
}

export function WorkoutLogProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, WorkoutLog>>(() => loadJSON(DRAFT_LOGS_STORAGE_KEY, {}));
  const [completedRows, setCompletedRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    saveJSON(DRAFT_LOGS_STORAGE_KEY, drafts);
  }, [drafts]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setCompletedRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('wod_completions')
      .select('day_key, workout_title, date_label, workout_timestamp, rounds, reps, time_taken, kettlebell_kg, notes, media_url, media_type, is_pb, completed_at')
      .eq('user_id', user.id)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(isBackendUnavailableError(fetchError) ? "Can't load your WOD history right now." : fetchError.message);
          setLoading(false);
          return;
        }
        setCompletedRows((data as Row[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const completedByDay = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of completedRows) map.set(row.day_key, row);
    return map;
  }, [completedRows]);

  const value = useMemo<WorkoutLogContextValue>(() => {
    const completedWorkouts = completedRows
      .map(rowToCompletedWorkout)
      .sort((a, b) => b.completedAt - a.completedAt);

    // Updating an already-completed day's logged results (rounds/reps/time/
    // KB/notes/media). Optimistic, same shape as toggleCompleted below — on
    // a failed write this rolls the row back to what it was before the edit
    // and surfaces writeError, rather than leaving an edit on screen that
    // never actually reached the database.
    // Round 44: also recomputes is_pb against this exact workout's own
    // prior history (every other row sharing the same workout_title,
    // excluding this one) every time results are saved — never only once
    // at first completion — so re-saving a better score still earns the
    // tag, and re-saving a worse one correctly drops it. Round 44.5 (owner
    // decision, final): weight no longer plays any part in this comparison.
    const syncCompletedRow = async (dayKey: string, log: WorkoutLog) => {
      if (!user) return;
      const existing = completedByDay.get(dayKey);
      if (!existing) return; // not completed yet — nothing to sync, stays a local draft
      const history = priorScoreForDayKey(existing);
      const { isPb } = checkPersonalBest(
        { time: log.time, rounds: log.rounds, reps: log.reps },
        history
      );
      const patch = {
        rounds: log.rounds,
        reps: log.reps.trim() || null,
        time_taken: log.time,
        kettlebell_kg: log.kettlebell.trim() || null,
        notes: log.notes,
        media_url: log.media?.uri ?? null,
        media_type: log.media?.type ?? null,
        is_pb: isPb,
      };
      setCompletedRows((prev) => prev.map((r) => (r.day_key === dayKey ? { ...r, ...patch } : r)));
      const { error: updateError } = await supabase
        .from('wod_completions')
        .update(patch)
        .eq('user_id', user.id)
        .eq('day_key', dayKey);
      if (updateError) {
        setCompletedRows((prev) => prev.map((r) => (r.day_key === dayKey ? existing : r)));
        setWriteError(describeChatFailure(updateError, "Couldn't save those results. Check your connection and try again."));
      }
    };

    return {
      loading,
      error,
      getLog: (dayKey) => {
        const row = completedByDay.get(dayKey);
        if (row) return rowToCompletedWorkout(row).log;
        return drafts[dayKey] ?? EMPTY_WORKOUT_LOG;
      },
      updateLog: (dayKey, field, value) => {
        const current = completedByDay.get(dayKey)
          ? rowToCompletedWorkout(completedByDay.get(dayKey)!).log
          : (drafts[dayKey] ?? EMPTY_WORKOUT_LOG);
        const nextLog = { ...current, [field]: value };
        setDrafts((prev) => ({ ...prev, [dayKey]: nextLog }));
        syncCompletedRow(dayKey, nextLog);
      },
      setLogMedia: (dayKey, media) => {
        const current = completedByDay.get(dayKey)
          ? rowToCompletedWorkout(completedByDay.get(dayKey)!).log
          : (drafts[dayKey] ?? EMPTY_WORKOUT_LOG);
        const nextLog = { ...current, media };
        setDrafts((prev) => ({ ...prev, [dayKey]: nextLog }));
        syncCompletedRow(dayKey, nextLog);
      },
      isCompleted: (dayKey) => completedByDay.has(dayKey),
      // Optimistic, but no longer fire-and-forget (the root cause this round
      // fixed): both branches await the write and roll the local state back
      // to exactly what it was if the write fails, instead of leaving a
      // checkmark on screen that was never actually saved — that gap is
      // what let a completion "disappear" on the next sign-in, because
      // there was never a real row behind it to re-fetch.
      toggleCompleted: (dayKey, workoutTitle, dateLabel, timestamp) => {
        if (!user) return;
        if (completedByDay.has(dayKey)) {
          const removedRow = completedByDay.get(dayKey)!;
          setCompletedRows((prev) => prev.filter((r) => r.day_key !== dayKey));
          supabase
            .from('wod_completions')
            .delete()
            .eq('user_id', user.id)
            .eq('day_key', dayKey)
            .then(({ error: deleteError }) => {
              if (deleteError) {
                setCompletedRows((prev) => [...prev, removedRow]);
                setWriteError(describeChatFailure(deleteError, "Couldn't undo that completion. Check your connection and try again."));
              }
            });
          return;
        }
        const log = drafts[dayKey] ?? EMPTY_WORKOUT_LOG;
        const nowIso = new Date().toISOString();
        // Round 44 — this branch only ever runs when no row exists yet for
        // this dayKey (the check just above), so there is never a prior
        // state to compare against — a brand-new completion can't be a PB
        // on its own first save, same rule DeckProgressContext's own
        // toggleComplete already applies for exactly the same reason.
        const isPb = false;
        const newRow: Row = {
          day_key: dayKey,
          workout_title: workoutTitle,
          date_label: dateLabel,
          workout_timestamp: timestamp,
          rounds: log.rounds,
          reps: log.reps.trim() || null,
          time_taken: log.time,
          kettlebell_kg: log.kettlebell.trim() || null,
          notes: log.notes,
          media_url: log.media?.uri ?? null,
          media_type: log.media?.type ?? null,
          is_pb: isPb,
          completed_at: nowIso,
        };
        setCompletedRows((prev) => [...prev, newRow]);
        supabase
          .from('wod_completions')
          .upsert(
            {
              user_id: user.id,
              day_key: dayKey,
              workout_title: workoutTitle,
              date_label: dateLabel,
              workout_timestamp: timestamp,
              rounds: log.rounds,
              reps: newRow.reps,
              time_taken: log.time,
              kettlebell_kg: newRow.kettlebell_kg,
              notes: log.notes,
              media_url: newRow.media_url,
              media_type: newRow.media_type,
              is_pb: newRow.is_pb,
              completed_at: nowIso,
            },
            { onConflict: 'user_id,day_key' }
          )
          .then(({ error: upsertError }) => {
            if (upsertError) {
              setCompletedRows((prev) => prev.filter((r) => r.day_key !== dayKey));
              setWriteError(describeChatFailure(upsertError, "Couldn't save that completion. Check your connection and try again."));
            }
          });
      },
      completedWorkouts,
      writeError,
      clearWriteError: () => setWriteError(null),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, completedRows, completedByDay, loading, error, writeError, user]);

  return <WorkoutLogContext.Provider value={value}>{children}</WorkoutLogContext.Provider>;
}

export function useWorkoutLog() {
  const ctx = useContext(WorkoutLogContext);
  if (!ctx) {
    throw new Error('useWorkoutLog must be used within a WorkoutLogProvider');
  }
  return ctx;
}
