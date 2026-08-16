import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.classSignUps.v2';

export type ClassSignUp = {
  dateKey: string;
  classId: string;
  className: string;
  classType: string;
  time: string;
  dayLabel: string;
  signedUpAt: number;
};

type NewSignUp = Omit<ClassSignUp, 'signedUpAt'>;

type ClassSignUpContextValue = {
  isSignedUp: (dateKey: string, classId: string) => boolean;
  getSignUp: (dateKey: string, classId: string) => ClassSignUp | undefined;
  signUp: (record: NewSignUp) => void;
  cancelSignUp: (dateKey: string, classId: string) => void;
  // Exposed for a future backend round: email confirmations and Doc's admin
  // roster view both read from this same list.
  allSignUps: ClassSignUp[];
};

const ClassSignUpContext = createContext<ClassSignUpContextValue | undefined>(undefined);

function key(dateKey: string, classId: string): string {
  return `${dateKey}::${classId}`;
}

export function ClassSignUpProvider({ children }: { children: React.ReactNode }) {
  const [signUps, setSignUps] = useState<Record<string, ClassSignUp>>(() => loadJSON(STORAGE_KEY, {}));

  useEffect(() => {
    saveJSON(STORAGE_KEY, signUps);
  }, [signUps]);

  const value = useMemo<ClassSignUpContextValue>(
    () => ({
      isSignedUp: (dateKey, classId) => !!signUps[key(dateKey, classId)],
      getSignUp: (dateKey, classId) => signUps[key(dateKey, classId)],
      signUp: (record) => {
        setSignUps((prev) => ({
          ...prev,
          [key(record.dateKey, record.classId)]: { ...record, signedUpAt: Date.now() },
        }));
      },
      cancelSignUp: (dateKey, classId) => {
        setSignUps((prev) => {
          const next = { ...prev };
          delete next[key(dateKey, classId)];
          return next;
        });
      },
      allSignUps: Object.values(signUps).sort((a, b) => a.signedUpAt - b.signedUpAt),
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
