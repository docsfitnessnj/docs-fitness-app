import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { MediaAttachment } from '../lib/media';
import { loadJSON, saveJSON } from '../lib/storage';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

// Draft log text (rounds/time/kettlebell/notes/media) while a WOD is still
// in progress stays local-only — nobody else needs to see a result you
// haven't marked complete yet, and it means typing doesn't round-trip to
// the server on every keystroke. The moment a day is marked complete, its
// snapshot is written to `wod_completions` and becomes the shared, durable
// record — see toggleCompleted below.
const DRAFT_LOGS_STORAGE_KEY = 'docsfitness.workoutLogDrafts.v1';

export type WorkoutLog = {
  rounds: string;
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
};

export const EMPTY_WORKOUT_LOG: WorkoutLog = { rounds: '', time: '', kettlebell: '', notes: '', media: null };

export function formatLogSummary(log: WorkoutLog): string {
  const parts = [
    log.rounds.trim() && `Rounds: ${log.rounds.trim()}`,
    log.time.trim() && `Time: ${log.time.trim()}`,
    log.kettlebell.trim() && `KB: ${log.kettlebell.trim()} kg`,
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
    log.kettlebell.trim() && `${log.kettlebell.trim()} KG`,
    log.rounds.trim() && `${log.rounds.trim().toUpperCase()} ROUNDS`,
    log.time.trim() && log.time.trim().toUpperCase(),
  ].filter(Boolean) as string[];
  if (parts.length === 0) return undefined;
  return `RESULTS: ${parts.join(' · ')}`;
}

type WorkoutLogContextValue = {
  loading: boolean;
  error: string | null;
  getLog: (dayKey: string) => WorkoutLog;
  updateLog: (dayKey: string, field: 'rounds' | 'time' | 'kettlebell' | 'notes', value: string) => void;
  setLogMedia: (dayKey: string, media: MediaAttachment | null) => void;
  isCompleted: (dayKey: string) => boolean;
  toggleCompleted: (dayKey: string, workoutTitle: string, dateLabel: string, timestamp: number) => void;
  completedWorkouts: CompletedWorkout[];
};

const WorkoutLogContext = createContext<WorkoutLogContextValue | undefined>(undefined);

type Row = {
  day_key: string;
  workout_title: string;
  date_label: string;
  workout_timestamp: number;
  rounds: string;
  time_taken: string;
  kettlebell_kg: number | null;
  notes: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
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
      time: row.time_taken,
      kettlebell: row.kettlebell_kg != null ? String(row.kettlebell_kg) : '',
      notes: row.notes,
      media: row.media_url ? { uri: row.media_url, type: row.media_type ?? 'image' } : null,
    },
  };
}

export function WorkoutLogProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, WorkoutLog>>(() => loadJSON(DRAFT_LOGS_STORAGE_KEY, {}));
  const [completedRows, setCompletedRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      .select('day_key, workout_title, date_label, workout_timestamp, rounds, time_taken, kettlebell_kg, notes, media_url, media_type, completed_at')
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

    const syncCompletedRow = async (dayKey: string, log: WorkoutLog) => {
      if (!user) return;
      const existing = completedByDay.get(dayKey);
      if (!existing) return; // not completed yet — nothing to sync, stays a local draft
      await supabase
        .from('wod_completions')
        .update({
          rounds: log.rounds,
          time_taken: log.time,
          kettlebell_kg: log.kettlebell ? Number(log.kettlebell) || null : null,
          notes: log.notes,
          media_url: log.media?.uri ?? null,
          media_type: log.media?.type ?? null,
        })
        .eq('user_id', user.id)
        .eq('day_key', dayKey);
      setCompletedRows((prev) =>
        prev.map((r) =>
          r.day_key === dayKey
            ? { ...r, rounds: log.rounds, time_taken: log.time, kettlebell_kg: log.kettlebell ? Number(log.kettlebell) || null : null, notes: log.notes, media_url: log.media?.uri ?? null, media_type: log.media?.type ?? null }
            : r
        )
      );
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
      toggleCompleted: (dayKey, workoutTitle, dateLabel, timestamp) => {
        if (!user) return;
        if (completedByDay.has(dayKey)) {
          setCompletedRows((prev) => prev.filter((r) => r.day_key !== dayKey));
          supabase.from('wod_completions').delete().eq('user_id', user.id).eq('day_key', dayKey);
          return;
        }
        const log = drafts[dayKey] ?? EMPTY_WORKOUT_LOG;
        const nowIso = new Date().toISOString();
        const newRow: Row = {
          day_key: dayKey,
          workout_title: workoutTitle,
          date_label: dateLabel,
          workout_timestamp: timestamp,
          rounds: log.rounds,
          time_taken: log.time,
          kettlebell_kg: log.kettlebell ? Number(log.kettlebell) || null : null,
          notes: log.notes,
          media_url: log.media?.uri ?? null,
          media_type: log.media?.type ?? null,
          completed_at: nowIso,
        };
        setCompletedRows((prev) => [...prev, newRow]);
        supabase.from('wod_completions').upsert(
          {
            user_id: user.id,
            day_key: dayKey,
            workout_title: workoutTitle,
            date_label: dateLabel,
            workout_timestamp: timestamp,
            rounds: log.rounds,
            time_taken: log.time,
            kettlebell_kg: newRow.kettlebell_kg,
            notes: log.notes,
            media_url: newRow.media_url,
            media_type: newRow.media_type,
            completed_at: nowIso,
          },
          { onConflict: 'user_id,day_key' }
        );
      },
      completedWorkouts,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, completedRows, completedByDay, loading, error, user]);

  return <WorkoutLogContext.Provider value={value}>{children}</WorkoutLogContext.Provider>;
}

export function useWorkoutLog() {
  const ctx = useContext(WorkoutLogContext);
  if (!ctx) {
    throw new Error('useWorkoutLog must be used within a WorkoutLogProvider');
  }
  return ctx;
}
