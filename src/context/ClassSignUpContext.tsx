import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.classSignUps.v1';

type ClassSignUpContextValue = {
  isSignedUp: (dayKey: string, classId: string) => boolean;
  toggleSignUp: (dayKey: string, classId: string) => void;
};

const ClassSignUpContext = createContext<ClassSignUpContextValue | undefined>(undefined);

function key(dayKey: string, classId: string): string {
  return `${dayKey}::${classId}`;
}

export function ClassSignUpProvider({ children }: { children: React.ReactNode }) {
  const [signUps, setSignUps] = useState<Record<string, boolean>>(() => loadJSON(STORAGE_KEY, {}));

  useEffect(() => {
    saveJSON(STORAGE_KEY, signUps);
  }, [signUps]);

  const value = useMemo<ClassSignUpContextValue>(
    () => ({
      isSignedUp: (dayKey, classId) => !!signUps[key(dayKey, classId)],
      toggleSignUp: (dayKey, classId) => {
        setSignUps((prev) => {
          const k = key(dayKey, classId);
          return { ...prev, [k]: !prev[k] };
        });
      },
    }),
    [signUps]
  );

  return <ClassSignUpContext.Provider value={value}>{children}</ClassSignUpContext.Provider>;
}

export function useClassSignUp() {
  const ctx = useContext(ClassSignUpContext);
  if (!ctx) {
    throw new Error('useClassSignUp must be used within a ClassSignUpProvider');
  }
  return ctx;
}
