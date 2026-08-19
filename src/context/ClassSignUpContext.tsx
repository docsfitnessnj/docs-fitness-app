import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';
import { BookingNotificationEvent, sendBookingNotifications } from '../lib/notifications';
import { LOCATION_NAME } from '../data/schedule';

const STORAGE_KEY = 'docsfitness.classSignUps.v2';
const EVENTS_STORAGE_KEY = 'docsfitness.bookingEvents.v1';
const MAX_LOGGED_EVENTS = 200;

export type ClassSignUp = {
  dateKey: string;
  classId: string;
  className: string;
  classType: string;
  time: string;
  dayLabel: string;
  signedUpAt: number;
  // Captured at booking time so the admin roster can show who's coming and
  // on what plan without needing a real multi-user backend yet.
  memberName: string;
  planType: string;
  // True when this booking redeemed the free-first-class offer — lets the
  // admin roster flag new faces before Doc walks into class.
  firstClass?: boolean;
};

export type BookingEvent = BookingNotificationEvent & {
  id: string;
  dateKey: string;
  classId: string;
  timestamp: number;
  memberEmailSent: boolean;
  docEmailSent: boolean;
};

type NewSignUp = Omit<ClassSignUp, 'signedUpAt'>;

type ClassSignUpContextValue = {
  isSignedUp: (dateKey: string, classId: string) => boolean;
  getSignUp: (dateKey: string, classId: string) => ClassSignUp | undefined;
  signUp: (record: NewSignUp) => void;
  cancelSignUp: (dateKey: string, classId: string) => void;
  // Read by Doc's admin roster view (and eventually email confirmations).
  allSignUps: ClassSignUp[];
  bookingEvents: BookingEvent[];
};

const ClassSignUpContext = createContext<ClassSignUpContextValue | undefined>(undefined);

function key(dateKey: string, classId: string): string {
  return `${dateKey}::${classId}`;
}

let eventIdCounter = 0;
function nextEventId(): string {
  eventIdCounter += 1;
  return `booking-event-${eventIdCounter}`;
}

export function ClassSignUpProvider({ children }: { children: React.ReactNode }) {
  const [signUps, setSignUps] = useState<Record<string, ClassSignUp>>(() => loadJSON(STORAGE_KEY, {}));
  const [events, setEvents] = useState<BookingEvent[]>(() => loadJSON(EVENTS_STORAGE_KEY, []));

  useEffect(() => {
    saveJSON(STORAGE_KEY, signUps);
  }, [signUps]);

  useEffect(() => {
    saveJSON(EVENTS_STORAGE_KEY, events);
  }, [events]);

  const logEvent = (type: 'booked' | 'cancelled', record: ClassSignUp) => {
    const notification: BookingNotificationEvent = {
      type,
      memberName: record.memberName,
      planType: record.planType,
      className: record.className,
      classType: record.classType,
      dayLabel: record.dayLabel,
      time: record.time,
      locationName: LOCATION_NAME,
    };
    const result = sendBookingNotifications(notification);
    setEvents((prev) =>
      [
        {
          ...notification,
          id: nextEventId(),
          dateKey: record.dateKey,
          classId: record.classId,
          timestamp: Date.now(),
          memberEmailSent: result.memberEmailSent,
          docEmailSent: result.docEmailSent,
        },
        ...prev,
      ].slice(0, MAX_LOGGED_EVENTS)
    );
  };

  const value = useMemo<ClassSignUpContextValue>(
    () => ({
      isSignedUp: (dateKey, classId) => !!signUps[key(dateKey, classId)],
      getSignUp: (dateKey, classId) => signUps[key(dateKey, classId)],
      signUp: (record) => {
        const full: ClassSignUp = { ...record, signedUpAt: Date.now() };
        setSignUps((prev) => ({ ...prev, [key(record.dateKey, record.classId)]: full }));
        logEvent('booked', full);
      },
      cancelSignUp: (dateKey, classId) => {
        const existing = signUps[key(dateKey, classId)];
        setSignUps((prev) => {
          const next = { ...prev };
          delete next[key(dateKey, classId)];
          return next;
        });
        if (existing) logEvent('cancelled', existing);
      },
      allSignUps: Object.values(signUps).sort((a, b) => a.signedUpAt - b.signedUpAt),
      bookingEvents: events,
    }),
    [signUps, events]
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
