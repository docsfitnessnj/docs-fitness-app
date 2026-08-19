import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsFitness.tourCompleted';

// The 4 spotlight stops, in order. Components register themselves under
// these keys via `registerTarget` so the overlay can measure them by
// component reference instead of fixed coordinates.
export const TOUR_TARGET_KEYS = ['story-ring', 'date-strip', 'composer-bar', 'tab-bar'] as const;
export type TourTargetKey = (typeof TOUR_TARGET_KEYS)[number];

// Minimal shape we rely on from the registered node — Pressable/View both
// forward a ref exposing this on every RN platform including web.
export type MeasurableNode = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

type TourContextValue = {
  active: boolean;
  stepIndex: number;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  registerTarget: (key: TourTargetKey) => (node: MeasurableNode | null) => void;
  getTargetNode: (key: TourTargetKey) => MeasurableNode | null;
  resetForTesting: () => void;
};

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState(() => loadJSON(STORAGE_KEY, false));
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const targets = useRef<Partial<Record<TourTargetKey, MeasurableNode | null>>>({});
  const refCallbacks = useRef<Partial<Record<TourTargetKey, (node: MeasurableNode | null) => void>>>({});

  const finish = () => {
    setActive(false);
    setCompleted(true);
    saveJSON(STORAGE_KEY, true);
  };

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      stepIndex,
      start: () => {
        if (completed) return;
        setStepIndex(0);
        setActive(true);
      },
      next: () => {
        setStepIndex((i) => {
          if (i >= TOUR_TARGET_KEYS.length - 1) {
            finish();
            return i;
          }
          return i + 1;
        });
      },
      back: () => setStepIndex((i) => Math.max(0, i - 1)),
      skip: () => finish(),
      registerTarget: (key) => {
        if (!refCallbacks.current[key]) {
          refCallbacks.current[key] = (node) => {
            targets.current[key] = node;
          };
        }
        return refCallbacks.current[key]!;
      },
      getTargetNode: (key) => targets.current[key] ?? null,
      // Clears the persisted flag and immediately restarts the tour in one
      // shot — calling setCompleted(false) then a separate start() would
      // have start() read the still-stale `completed` closure from this
      // same render, since React batches the state update.
      resetForTesting: () => {
        setCompleted(false);
        saveJSON(STORAGE_KEY, false);
        setStepIndex(0);
        setActive(true);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, stepIndex, completed]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return ctx;
}
