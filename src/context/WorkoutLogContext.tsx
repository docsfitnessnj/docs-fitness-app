import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MediaAttachment } from '../lib/media';
import { loadJSON, saveJSON } from '../lib/storage';

const LOGS_STORAGE_KEY = 'docsfitness.workoutLogs.v1';
const COMPLETED_STORAGE_KEY = 'docsfitness.workoutCompleted.v1';

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

type CompletedMeta = {
  workoutTitle: string;
  dateLabel: string;
  timestamp: number;
  completedAt: number;
};

type WorkoutLogContextValue = {
  getLog: (dayKey: string) => WorkoutLog;
  updateLog: (dayKey: string, field: 'rounds' | 'time' | 'kettlebell' | 'notes', value: string) => void;
  setLogMedia: (dayKey: string, media: MediaAttachment | null) => void;
  isCompleted: (dayKey: string) => boolean;
  toggleCompleted: (dayKey: string, workoutTitle: string, dateLabel: string, timestamp: number) => void;
  completedWorkouts: CompletedWorkout[];
};

const WorkoutLogContext = createContext<WorkoutLogContextValue | undefined>(undefined);

export function WorkoutLogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>(() => loadJSON(LOGS_STORAGE_KEY, {}));
  const [completed, setCompleted] = useState<Record<string, CompletedMeta>>(() =>
    loadJSON(COMPLETED_STORAGE_KEY, {})
  );

  useEffect(() => {
    saveJSON(LOGS_STORAGE_KEY, logs);
  }, [logs]);

  useEffect(() => {
    saveJSON(COMPLETED_STORAGE_KEY, completed);
  }, [completed]);

  const value = useMemo<WorkoutLogContextValue>(() => {
    const completedWorkouts = Object.entries(completed)
      .map(([dayKey, meta]) => ({ ...meta, dayKey, log: logs[dayKey] ?? EMPTY_WORKOUT_LOG }))
      .sort((a, b) => b.completedAt - a.completedAt);

    return {
      getLog: (dayKey) => logs[dayKey] ?? EMPTY_WORKOUT_LOG,
      updateLog: (dayKey, field, value) => {
        setLogs((prev) => ({ ...prev, [dayKey]: { ...(prev[dayKey] ?? EMPTY_WORKOUT_LOG), [field]: value } }));
      },
      setLogMedia: (dayKey, media) => {
        setLogs((prev) => ({ ...prev, [dayKey]: { ...(prev[dayKey] ?? EMPTY_WORKOUT_LOG), media } }));
      },
      isCompleted: (dayKey) => !!completed[dayKey],
      toggleCompleted: (dayKey, workoutTitle, dateLabel, timestamp) => {
        setCompleted((prev) => {
          if (prev[dayKey]) {
            const next = { ...prev };
            delete next[dayKey];
            return next;
          }
          return { ...prev, [dayKey]: { workoutTitle, dateLabel, timestamp, completedAt: Date.now() } };
        });
      },
      completedWorkouts,
    };
  }, [logs, completed]);

  return <WorkoutLogContext.Provider value={value}>{children}</WorkoutLogContext.Provider>;
}

export function useWorkoutLog() {
  const ctx = useContext(WorkoutLogContext);
  if (!ctx) {
    throw new Error('useWorkoutLog must be used within a WorkoutLogProvider');
  }
  return ctx;
}
