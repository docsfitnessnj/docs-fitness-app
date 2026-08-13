import React, { createContext, useContext, useMemo, useState } from 'react';

export type WorkoutLog = {
  rounds: string;
  time: string;
  kettlebell: string;
  notes: string;
};

export type CompletedWorkout = {
  dayKey: string;
  workoutTitle: string;
  dateLabel: string;
  timestamp: number;
  completedAt: number;
  log: WorkoutLog;
};

export const EMPTY_WORKOUT_LOG: WorkoutLog = { rounds: '', time: '', kettlebell: '', notes: '' };

export function formatLogSummary(log: WorkoutLog): string {
  const parts = [
    log.rounds.trim() && `Rounds: ${log.rounds.trim()}`,
    log.time.trim() && `Time: ${log.time.trim()}`,
    log.kettlebell.trim() && `KB: ${log.kettlebell.trim()}`,
  ].filter(Boolean) as string[];
  const summary = parts.join(' · ');
  if (log.notes.trim()) {
    return summary ? `${summary}\n${log.notes.trim()}` : log.notes.trim();
  }
  return summary;
}

type CompletedMeta = {
  workoutTitle: string;
  dateLabel: string;
  timestamp: number;
  completedAt: number;
};

type WorkoutLogContextValue = {
  getLog: (dayKey: string) => WorkoutLog;
  updateLog: (dayKey: string, field: keyof WorkoutLog, value: string) => void;
  isCompleted: (dayKey: string) => boolean;
  toggleCompleted: (dayKey: string, workoutTitle: string, dateLabel: string, timestamp: number) => void;
  completedWorkouts: CompletedWorkout[];
};

const WorkoutLogContext = createContext<WorkoutLogContextValue | undefined>(undefined);

export function WorkoutLogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>({});
  const [completed, setCompleted] = useState<Record<string, CompletedMeta>>({});

  const value = useMemo<WorkoutLogContextValue>(() => {
    const completedWorkouts = Object.entries(completed)
      .map(([dayKey, meta]) => ({ ...meta, dayKey, log: logs[dayKey] ?? EMPTY_WORKOUT_LOG }))
      .sort((a, b) => b.completedAt - a.completedAt);

    return {
      getLog: (dayKey) => logs[dayKey] ?? EMPTY_WORKOUT_LOG,
      updateLog: (dayKey, field, value) => {
        setLogs((prev) => ({ ...prev, [dayKey]: { ...(prev[dayKey] ?? EMPTY_WORKOUT_LOG), [field]: value } }));
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
