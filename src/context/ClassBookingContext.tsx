import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { formatDateKey } from '../data/content';
import { fastRemoveChannel } from '../lib/deferredRealtimeChannel';
import { supabase } from '../lib/supabaseClient';

// Real, server-backed class booking (migration_023) — replaces the old
// device-local ClassSignUpContext, whose Record<string, ClassSignUp> lived
// only in this one browser's localStorage, had no concept of capacity, and
// no real userId (just a denormalized display-name string). Every device
// now reads and writes the same shared class_sessions/class_bookings/
// class_waitlist tables, and capacity is enforced atomically server-side
// (book_class's row lock — see migration_023.sql), never trusted client-side.

export type ClassSession = {
  id: string;
  classKey: string;
  // The app's own local-calendar-day key (see formatDateKey in
  // data/content.ts) — NOT the raw Postgres `date` string, which is a
  // different, zero-padded format. Every lookup in this context goes
  // through this key, same convention the rest of the booking UI already
  // uses for (dateKey, classId) pairs.
  dateKey: string;
  startAt: number; // epoch ms
  className: string;
  classType: string;
  locationName: string;
  capacity: number | null; // null = uncapped (Pilates)
  isGuestClass: boolean;
  priceCents: number | null;
  stripePriceId: string | null;
  bookedCount: number;
  waitingCount: number;
};

export type MyBooking = {
  id: string;
  sessionId: string;
  paymentMethod: 'unlimited' | 'pack_credit' | 'drop_in_paid' | 'first_class_free' | 'pilates_paid';
};

export type MyWaitlistEntry = {
  id: string;
  sessionId: string;
  paymentMethod: 'unlimited' | 'pack_credit';
};

type BookResult = { ok: true } | { ok: false; code: string; message: string };

type ClassBookingContextValue = {
  loading: boolean;
  refetching: boolean;
  error: string | null;
  sessions: ClassSession[];
  // One lookup key, `${classKey}::${dateKey}`, so every screen that already
  // has a schedule.ts ClassRow.id (== classKey) and a dateKey can find the
  // live session instantly without re-deriving anything.
  getSession: (classKey: string, dateKey: string) => ClassSession | undefined;
  getMyBooking: (sessionId: string) => MyBooking | undefined;
  getMyWaitlistEntry: (sessionId: string) => MyWaitlistEntry | undefined;
  // True the moment this account has EVER booked any class, even one since
  // cancelled — unlike the live sessions/bookings above (which only ever
  // reflect right-now state), this keeps every booking ever made, same
  // spirit as the old local bookingEvents log it replaces. Drives the
  // "first time visitor" Dockside banner variant (StatusBanner.tsx).
  hasEverBooked: boolean;
  // True the moment this account has ever paid for a $25 Drop In, even if
  // that booking was later cancelled — lets an online member who's dropped
  // in before keep seeing the in-person booking card (CommunityScreen.tsx),
  // sourced from in_person_purchases (never deleted) rather than a booking
  // row that a cancellation could remove.
  hasBookedDropInBefore: boolean;
  refetch: () => Promise<void>;
  book: (sessionId: string, paymentMethod: 'unlimited' | 'pack_credit' | 'first_class_free') => Promise<BookResult>;
  cancel: (bookingId: string) => Promise<BookResult>;
  joinWaitlist: (sessionId: string, paymentMethod: 'unlimited' | 'pack_credit') => Promise<BookResult>;
  leaveWaitlist: (waitlistId: string) => Promise<BookResult>;
};

const ClassBookingContext = createContext<ClassBookingContextValue | undefined>(undefined);

// Matches the server's own default generation/read horizon (current_date +
// 21) — and Community's own BOOKING_DAYS_AHEAD rolling date strip, which is
// the UI this all actually has to cover. See AGENTS.md's "booking window"
// decision for why 21, not a literal 14 ("2 weeks").
const BOOKING_WINDOW_DAYS = 21;

// A Postgres `date` column serializes as zero-padded 'YYYY-MM-DD' —
// deliberately NOT the same string formatDateKey produces ('2026-1-5', no
// padding). Parsing with `new Date('2026-01-05')` would read it as UTC
// midnight, which can land on the PREVIOUS local day in a negative-UTC-
// offset timezone — this splits and reconstructs via the local-time Date
// constructor instead, then hands off to the app's own formatDateKey so
// every lookup in this app agrees on one date-key convention.
function pgDateToDateKey(pgDate: string): string {
  const [y, m, d] = pgDate.split('-').map((n) => parseInt(n, 10));
  return formatDateKey(new Date(y, m - 1, d));
}

type SessionRow = {
  id: string;
  class_key: string;
  session_date: string;
  start_at: string;
  class_name: string;
  class_type: string;
  location_name: string;
  capacity: number | null;
  is_guest_class: boolean;
  price_cents: number | null;
  stripe_price_id: string | null;
  booked_count: number;
  waiting_count: number;
};

const LOG_TAG = '[memberState:classBooking]';

export function ClassBookingProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [myWaitlist, setMyWaitlist] = useState<MyWaitlistEntry[]>([]);
  const [hasEverBooked, setHasEverBooked] = useState(false);
  const [hasBookedDropInBefore, setHasBookedDropInBefore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const lastUserId = useRef<string | null>(null);

  const refetch = async () => {
    if (!user) return;
    const isRefetch = hasLoadedOnce.current;
    // ensure_class_sessions() is idempotent and self-healing — calling it
    // before every read means the rolling window is never stale even if
    // the daily cron job (migration_023.sql) hasn't run yet for some reason.
    // The two `head: true` counts are existence-only checks (never
    // filtered on status) — "ever booked"/"ever paid for a drop-in" must
    // stay true even after a later cancellation.
    const [, sessionsRes, bookingsRes, waitlistRes, everBookedRes, everDropInRes] = await Promise.all([
      supabase.rpc('ensure_class_sessions'),
      supabase.rpc('class_sessions_with_availability'),
      supabase.from('class_bookings').select('id, session_id, payment_method').eq('status', 'booked'),
      supabase.from('class_waitlist').select('id, session_id, payment_method').eq('status', 'waiting'),
      supabase.from('class_bookings').select('id', { count: 'exact', head: true }),
      supabase.from('in_person_purchases').select('id', { count: 'exact', head: true }).eq('plan', 'drop_in'),
    ]);
    if (sessionsRes.error || bookingsRes.error || waitlistRes.error) {
      const err = sessionsRes.error ?? bookingsRes.error ?? waitlistRes.error;
      if (isRefetch) {
        console.error(LOG_TAG, 'refetch error — keeping last known good state', err);
        return;
      }
      console.error(LOG_TAG, 'fetch error', err);
      setError(err!.message);
      return;
    }
    if (!everBookedRes.error) setHasEverBooked((everBookedRes.count ?? 0) > 0);
    if (!everDropInRes.error) setHasBookedDropInBefore((everDropInRes.count ?? 0) > 0);
    setError(null);
    setSessions(
      ((sessionsRes.data as SessionRow[] | null) ?? []).map((row) => ({
        id: row.id,
        classKey: row.class_key,
        dateKey: pgDateToDateKey(row.session_date),
        startAt: new Date(row.start_at).getTime(),
        className: row.class_name,
        classType: row.class_type,
        locationName: row.location_name,
        capacity: row.capacity,
        isGuestClass: row.is_guest_class,
        priceCents: row.price_cents,
        stripePriceId: row.stripe_price_id,
        bookedCount: row.booked_count,
        waitingCount: row.waiting_count,
      }))
    );
    setMyBookings(
      ((bookingsRes.data as { id: string; session_id: string; payment_method: string }[] | null) ?? []).map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        paymentMethod: row.payment_method as MyBooking['paymentMethod'],
      }))
    );
    setMyWaitlist(
      ((waitlistRes.data as { id: string; session_id: string; payment_method: string }[] | null) ?? []).map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        paymentMethod: row.payment_method as MyWaitlistEntry['paymentMethod'],
      }))
    );
    hasLoadedOnce.current = true;
  };

  useEffect(() => {
    if (!authReady) return;
    const currentUserId = user?.id ?? null;
    if (currentUserId !== lastUserId.current) {
      lastUserId.current = currentUserId;
      hasLoadedOnce.current = false;
      setSessions([]);
      setMyBookings([]);
      setMyWaitlist([]);
      setHasEverBooked(false);
      setHasBookedDropInBefore(false);
      setError(null);
      setRefetching(false);
      setLoading(true);
    }
    if (!user) return;
    let cancelled = false;
    const isRefetch = hasLoadedOnce.current;
    if (isRefetch) setRefetching(true);
    else setLoading(true);
    refetch().finally(() => {
      if (cancelled) return;
      if (isRefetch) setRefetching(false);
      else setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  // "When someone cancels, the first waitlisted member is automatically
  // promoted to booked... and sees it reflected in the app" — book_class/
  // cancel_class_booking only ever run from whoever is cancelling, never
  // from the promoted member's own device, so without this there is
  // nothing to make THEIR screen update until they next happen to trigger
  // a refetch some other way. Unfiltered subscriptions, same convention as
  // GroupChatUnreadContext's own group_chat_messages channel — RLS already
  // means this account is only ever sent rows it can read (its own), so a
  // row-ownership check isn't needed to stay correct, only to stay cheap:
  // any change to either table refetches this account's own booking/
  // waitlist state, which also happily covers the admin bumping a
  // template's capacity open again.
  useEffect(() => {
    if (!user) return;
    const mountId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`class-booking-live-${mountId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_bookings' }, () => {
        if (hasLoadedOnce.current) refetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_waitlist' }, () => {
        if (hasLoadedOnce.current) refetch();
      })
      .subscribe();
    return () => {
      fastRemoveChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const sessionsByKey = useMemo(() => {
    const map = new Map<string, ClassSession>();
    for (const s of sessions) map.set(`${s.classKey}::${s.dateKey}`, s);
    return map;
  }, [sessions]);

  const bookingsBySessionId = useMemo(() => {
    const map = new Map<string, MyBooking>();
    for (const b of myBookings) map.set(b.sessionId, b);
    return map;
  }, [myBookings]);

  const waitlistBySessionId = useMemo(() => {
    const map = new Map<string, MyWaitlistEntry>();
    for (const w of myWaitlist) map.set(w.sessionId, w);
    return map;
  }, [myWaitlist]);

  function rpcErrorToResult(rpcError: { message: string } | null): BookResult {
    if (!rpcError) return { ok: true };
    // book_class/cancel_class_booking/join_waitlist/leave_waitlist raise
    // plain `RAISE EXCEPTION 'CODE: human text'` — the code is always the
    // leading token up to the first colon or whitespace, same convention
    // throughout migration_023.sql.
    const code = rpcError.message.split(/[:\s]/)[0] || 'ERROR';
    return { ok: false, code, message: rpcError.message };
  }

  const value = useMemo<ClassBookingContextValue>(
    () => ({
      loading,
      refetching,
      error,
      sessions,
      getSession: (classKey, dateKey) => sessionsByKey.get(`${classKey}::${dateKey}`),
      getMyBooking: (sessionId) => bookingsBySessionId.get(sessionId),
      getMyWaitlistEntry: (sessionId) => waitlistBySessionId.get(sessionId),
      hasEverBooked,
      hasBookedDropInBefore,
      refetch,
      book: async (sessionId, paymentMethod) => {
        const { error: rpcError } = await supabase.rpc('book_class', {
          p_session_id: sessionId,
          p_payment_method: paymentMethod,
        });
        await refetch();
        return rpcErrorToResult(rpcError);
      },
      cancel: async (bookingId) => {
        const { data, error: rpcError } = await supabase.rpc('cancel_class_booking', { p_booking_id: bookingId });
        // "drop in and Pilates payments auto refunded through Stripe
        // server side" — cancel_class_booking itself only ever touches
        // this app's own tables (it can't call out to Stripe from
        // Postgres); it reports back whether a real charge needs
        // refunding, and refund-booking (an Edge Function, same as every
        // other Stripe call in this app) is what actually issues it. Never
        // blocks the cancellation itself on this succeeding — the booking
        // is already cancelled by the time this runs, and a refund
        // hiccup is logged, not surfaced as "your cancel failed."
        const needsRefund = !rpcError && (data as { needs_stripe_refund?: boolean }[] | null)?.[0]?.needs_stripe_refund;
        if (needsRefund) {
          const { error: refundError } = await supabase.functions.invoke('refund-booking', { body: { bookingId } });
          if (refundError) console.error(LOG_TAG, 'refund-booking failed', refundError);
        }
        await refetch();
        return rpcErrorToResult(rpcError);
      },
      joinWaitlist: async (sessionId, paymentMethod) => {
        const { error: rpcError } = await supabase.rpc('join_waitlist', {
          p_session_id: sessionId,
          p_payment_method: paymentMethod,
        });
        await refetch();
        return rpcErrorToResult(rpcError);
      },
      leaveWaitlist: async (waitlistId) => {
        const { error: rpcError } = await supabase.rpc('leave_waitlist', { p_waitlist_id: waitlistId });
        await refetch();
        return rpcErrorToResult(rpcError);
      },
    }),
    [loading, refetching, error, sessions, sessionsByKey, bookingsBySessionId, waitlistBySessionId, hasEverBooked, hasBookedDropInBefore]
  );

  return <ClassBookingContext.Provider value={value}>{children}</ClassBookingContext.Provider>;
}

export function useClassBookingData() {
  const ctx = useContext(ClassBookingContext);
  if (!ctx) {
    throw new Error('useClassBookingData must be used within a ClassBookingProvider');
  }
  return ctx;
}

export const CLASS_BOOKING_WINDOW_DAYS = BOOKING_WINDOW_DAYS;
