import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getWeekStart } from '../data/content';
import { loadJSON, saveJSON } from '../lib/storage';

// Deliberately NOT prefixed "docsfitness." (see storage.ts's clearAppStorage,
// which sweeps every key under that prefix on sign-out). Doc's draft content
// calendar isn't per-account app state — it's Doc's own working data, and
// nothing about a demo sign-out (kept around for showing the app off) should
// be able to wipe out weeks of drafted workouts.
const STORAGE_KEY = 'contentLibraryDrafts.v1';

export type ContentWorkoutType = 'wod' | 'cow';
export type ContentWorkoutStatus = 'draft' | 'scheduled' | 'released';

export type ContentWorkout = {
  id: string;
  name: string;
  type: ContentWorkoutType;
  // e.g. "30min AMRAP", "5 Rounds", "EMOM 12".
  format: string;
  formatDescription: string;
  // One movement per line, free text — matched against THE MOVEMENT VAULT
  // by name/alias wherever possible (see movementMatcher.ts) so the tappable
  // video links work automatically once this is real WOD/COW content.
  movements: string[];
  videoUrl: string;
  notes: string;
  // Epoch ms — the moment this workout is meant to go live.
  releaseAt: number;
  status: ContentWorkoutStatus;
  createdAt: number;
  updatedAt: number;
};

export type ContentWorkoutInput = Omit<ContentWorkout, 'id' | 'createdAt' | 'updatedAt'>;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `content-${Date.now()}-${idCounter}`;
}

type ContentLibraryContextValue = {
  workouts: ContentWorkout[];
  addWorkout: (input: ContentWorkoutInput) => void;
  updateWorkout: (id: string, input: ContentWorkoutInput) => void;
  deleteWorkout: (id: string) => void;
  // Bulk paste import — already-parsed entries, appended as new drafts.
  importWorkouts: (inputs: ContentWorkoutInput[]) => void;
  // Sets every workout whose releaseAt falls inside [weekStart, weekStart+7d)
  // to RELEASED — the "REVIEW & PUBLISH" action for a given week.
  releaseWeek: (weekStart: number) => void;
};

const ContentLibraryContext = createContext<ContentLibraryContextValue | undefined>(undefined);

export function ContentLibraryProvider({ children }: { children: React.ReactNode }) {
  const [workouts, setWorkouts] = useState<ContentWorkout[]>(() => loadJSON(STORAGE_KEY, []));

  useEffect(() => {
    saveJSON(STORAGE_KEY, workouts);
  }, [workouts]);

  const value = useMemo<ContentLibraryContextValue>(
    () => ({
      workouts,
      addWorkout: (input) => {
        const now = Date.now();
        setWorkouts((prev) => [...prev, { ...input, id: nextId(), createdAt: now, updatedAt: now }]);
      },
      updateWorkout: (id, input) => {
        setWorkouts((prev) =>
          prev.map((w) => (w.id === id ? { ...w, ...input, id: w.id, createdAt: w.createdAt, updatedAt: Date.now() } : w))
        );
      },
      deleteWorkout: (id) => {
        setWorkouts((prev) => prev.filter((w) => w.id !== id));
      },
      importWorkouts: (inputs) => {
        const now = Date.now();
        setWorkouts((prev) => [
          ...prev,
          ...inputs.map((input, i) => ({ ...input, id: nextId(), createdAt: now + i, updatedAt: now + i })),
        ]);
      },
      releaseWeek: (weekStart) => {
        const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
        setWorkouts((prev) =>
          prev.map((w) =>
            w.releaseAt >= weekStart && w.releaseAt < weekEnd ? { ...w, status: 'released', updatedAt: Date.now() } : w
          )
        );
      },
    }),
    [workouts]
  );

  return <ContentLibraryContext.Provider value={value}>{children}</ContentLibraryContext.Provider>;
}

export function useContentLibrary() {
  const ctx = useContext(ContentLibraryContext);
  if (!ctx) {
    throw new Error('useContentLibrary must be used within a ContentLibraryProvider');
  }
  return ctx;
}

// A week "belongs to" the calendar month containing its Monday — so a week
// that spans a month boundary (e.g. Mon Jan 26 - Sun Feb 1) groups under
// January, the month Doc actually planned it in.
export function weekMonthKey(weekStart: number): string {
  const d = new Date(weekStart);
  // Zero-padded month so plain string comparison (used to sort months below)
  // still sorts chronologically — "2026-08" < "2026-11", where unpadded
  // "2026-8" would not be.
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

export function weekLabel(weekStart: number): string {
  const start = new Date(weekStart);
  const end = new Date(weekStart + 6 * 24 * 60 * 60 * 1000);
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr =
    start.getMonth() === end.getMonth()
      ? end.toLocaleDateString('en-US', { day: 'numeric' })
      : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startStr}–${endStr}`.toUpperCase();
}

export type WeekGroup = {
  weekStart: number;
  workouts: ContentWorkout[];
  wodCount: number;
  cowCount: number;
  isComplete: boolean;
};

export type MonthGroup = {
  monthKey: string;
  weeks: WeekGroup[];
};

// The weekly rhythm: 5 Doc's WODs + 1 Challenge of the Week. Used both for
// the month/week accordion's at-a-glance gap indicator and for the RELEASE
// THIS WEEK review panel.
export const WEEKLY_WOD_TARGET = 5;
export const WEEKLY_COW_TARGET = 1;

// Groups every workout by month -> week (Monday-start), sorted chronologically.
export function groupWorkoutsByMonth(workouts: ContentWorkout[]): MonthGroup[] {
  const byWeek = new Map<number, ContentWorkout[]>();
  for (const w of workouts) {
    const weekStart = getWeekStart(new Date(w.releaseAt)).getTime();
    const list = byWeek.get(weekStart);
    if (list) list.push(w);
    else byWeek.set(weekStart, [w]);
  }

  const weekGroups: WeekGroup[] = Array.from(byWeek.entries())
    .map(([weekStart, list]) => {
      const sorted = [...list].sort((a, b) => a.releaseAt - b.releaseAt);
      const wodCount = sorted.filter((w) => w.type === 'wod').length;
      const cowCount = sorted.filter((w) => w.type === 'cow').length;
      return {
        weekStart,
        workouts: sorted,
        wodCount,
        cowCount,
        isComplete: wodCount === WEEKLY_WOD_TARGET && cowCount === WEEKLY_COW_TARGET,
      };
    })
    .sort((a, b) => a.weekStart - b.weekStart);

  const byMonth = new Map<string, WeekGroup[]>();
  for (const group of weekGroups) {
    const key = weekMonthKey(group.weekStart);
    const list = byMonth.get(key);
    if (list) list.push(group);
    else byMonth.set(key, [group]);
  }

  return Array.from(byMonth.entries())
    .map(([monthKey, weeks]) => ({ monthKey, weeks }))
    .sort((a, b) => (a.monthKey > b.monthKey ? 1 : -1));
}
