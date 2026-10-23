import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { isCheckoutRedirectPending } from '../lib/checkoutRedirectGate';
import { claimTour, releaseInterruption } from '../lib/interruptionGate';
import { useMembership } from './MembershipContext';
import { useProfile } from './ProfileContext';

// Every anchor key any tour variant can point at. Components register
// themselves under these keys via `registerTarget` so the overlay can
// measure them by component reference instead of fixed coordinates.
export const TOUR_TARGET_KEYS = [
  'story-ring',
  'date-strip',
  'composer-bar',
  'tab-bar',
  'wods-tab',
  'posts-feed',
] as const;
export type TourTargetKey = (typeof TOUR_TARGET_KEYS)[number];

// Round 27: full access members keep the original 4-stop tour (anchors:
// story ring, date strip, composer, the whole tab bar). Booking tier and
// online free members -- anyone without fullContentAccess -- get a
// different 4-stop variant pointed at what's actually theirs to use: the
// date strip (booking), the DOC'S WODS tab (their 2 free weekly workouts),
// the composer (open to every tier as of this round), and the posts feed
// itself. TourOverlay owns the per-stop title/body copy for each variant;
// this file only owns which ANCHORS each variant walks, in order.
const FULL_ACCESS_STOPS: TourTargetKey[] = ['story-ring', 'date-strip', 'composer-bar', 'tab-bar'];
const LIMITED_ACCESS_STOPS: TourTargetKey[] = ['date-strip', 'wods-tab', 'composer-bar', 'posts-feed'];

export type TourVariant = 'full' | 'limited';

// Minimal shape we rely on from the registered node — Pressable/View both
// forward a ref exposing this on every RN platform including web.
export type MeasurableNode = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

// Test-only: lets the Playwright suite simulate "this anchor never
// rendered" for a specific key, so the real skip-filtering logic below can
// be exercised end to end against a genuinely missing anchor -- there is
// no way to organically force a structural element missing from a real
// signed-in build (every anchor in both variants is, by design, always
// present for every tier after this round's access changes), the same
// category of gap as every other "can't force the real failure mode"
// case this app's test suite already works around (FORCE_INSET_CSS,
// forceVisualViewportShrink). Real app code never touches this set.
const testForceMissing = new Set<TourTargetKey>();
if (typeof window !== 'undefined') {
  // A Playwright `addInitScript` runs before this module ever evaluates,
  // so it can only hand off a plain pre-seeded array (not call methods on
  // a Set this module hasn't created yet) — fold that in once, then
  // replace it with the real Set so later calls (an interactive toggle,
  // or a second check in the same page) work directly against it.
  const w = window as unknown as { __tourTestForceMissing?: TourTargetKey[] | Set<TourTargetKey> };
  const preseed = w.__tourTestForceMissing;
  if (preseed) {
    (Array.isArray(preseed) ? preseed : Array.from(preseed)).forEach((key) => testForceMissing.add(key));
  }
  w.__tourTestForceMissing = testForceMissing;
}

type TourContextValue = {
  active: boolean;
  stepIndex: number;
  variant: TourVariant;
  // The ACTIVE run's own ordered anchor list -- already filtered down to
  // only the anchors that were actually present (registered) the moment
  // this run started. stepIndex always indexes into THIS array, never the
  // full candidate list, which is what makes a skipped stop vanish from
  // the dots/numbering entirely instead of leaving a gap.
  stops: TourTargetKey[];
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
  // The once-ever flag lives on the member's own account (profiles.
  // tour_completed_at — see migration_010), not device/browser storage, so
  // it survives signing out and back in on any device. TourProvider is
  // nested inside ProfileProvider in App.tsx specifically so it can read
  // this. By the time anything can call start() (see the app-code fix
  // alongside this — MainApp doesn't render at all until ProfileContext's
  // own fetch has resolved), `tourCompletedAt` already reflects the real,
  // loaded value, never a stale default.
  const { tourCompletedAt, markTourCompleted, loading: profileLoading, refetching: profileRefetching } = useProfile();
  // Tier decides which of the two tour variants to build (see
  // FULL_ACCESS_STOPS/LIMITED_ACCESS_STOPS above) — read here, at the one
  // place that decides what a tour run actually walks, rather than
  // threading tier into TourOverlay itself.
  const {
    fullContentAccess,
    stateLoading: membershipLoading,
    stateRefetching: membershipRefetching,
  } = useMembership();
  const completed = tourCompletedAt !== null;
  const memberStateSettled = !profileLoading && !profileRefetching && !membershipLoading && !membershipRefetching;
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [variant, setVariant] = useState<TourVariant>('full');
  const [stops, setStops] = useState<TourTargetKey[]>(FULL_ACCESS_STOPS);
  const targets = useRef<Partial<Record<TourTargetKey, MeasurableNode | null>>>({});
  const refCallbacks = useRef<Partial<Record<TourTargetKey, (node: MeasurableNode | null) => void>>>({});

  const getTargetNode = (key: TourTargetKey): MeasurableNode | null =>
    testForceMissing.has(key) ? null : targets.current[key] ?? null;

  const finish = () => {
    setActive(false);
    releaseInterruption('tour');
    markTourCompleted(true);
  };

  // Builds this run's real stop list: the candidate anchors for whichever
  // variant this tier gets, filtered down to only the ones actually
  // registered right now. By the time this runs (always from inside
  // start()/resetForTesting(), themselves only ever called after
  // CommunityScreen has mounted and settled), every sibling on that screen
  // has already attached its ref during React's commit phase — refs
  // attach before effects run, and effects run children-before-parents, so
  // there is no render/measure race here to wait out, only a genuine
  // "does this element exist in this signed-in session at all" check.
  const buildStops = (): { variant: TourVariant; stops: TourTargetKey[] } => {
    const nextVariant: TourVariant = fullContentAccess ? 'full' : 'limited';
    const candidates = nextVariant === 'full' ? FULL_ACCESS_STOPS : LIMITED_ACCESS_STOPS;
    const present = candidates.filter((key) => getTargetNode(key) !== null);
    return { variant: nextVariant, stops: present };
  };

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      stepIndex,
      variant,
      stops,
      // The tour's ONE entry point — every call site (CommunityScreen's own
      // mount, and the purchase celebration's GET STARTED) funnels through
      // this same gate, so there is exactly one place that decides whether
      // the tour is allowed to become visible at all. Nothing else may ever
      // set `active` true. The gate is a plain synchronous check — never
      // "start now, hide a moment later" — so a blocked call never renders
      // so much as a single frame, and never touches `completed`: only
      // finishing or skipping the tour ever burns the once-ever flag, so a
      // suppressed start here always leaves a real chance for the tour to
      // run later (the next time something calls start() with the gate
      // open), not a silently-consumed one.
      start: () => {
        const checkoutPending = isCheckoutRedirectPending();
        console.log('[memberState:tour] start() called', {
          tourCompletedAt: tourCompletedAt ? tourCompletedAt.toISOString() : null,
          completed,
          checkoutPending,
          memberStateSettled,
          profileLoading,
          profileRefetching,
          membershipLoading,
          membershipRefetching,
          decision: completed
            ? 'BLOCKED (already completed/skipped)'
            : checkoutPending
              ? 'BLOCKED (checkout pending)'
              : !memberStateSettled
                ? 'BLOCKED (member state loading/refetching)'
                : 'ALLOWED',
        });
        if (completed) return;
        if (checkoutPending) return;
        // Never measure spotlight targets against a render taken mid-fetch
        // or mid-refetch — the one-shot caller (CommunityScreen's mount
        // effect) is responsible for not burning its only attempt on this
        // transient block; this check is defense in depth for any other
        // caller.
        if (!memberStateSettled) return;
        const built = buildStops();
        // No anchor at all for this tier's whole variant -- an extremely
        // unlikely, almost certainly broken state (every anchor in both
        // variants is otherwise always present by construction). Bail
        // WITHOUT burning the once-ever flag, so a real fix (or just a
        // slower render next time) still gets a genuine first attempt
        // later, rather than silently consuming it on nothing.
        if (built.stops.length === 0) return;
        // Claims the shared interruption slot (interruptionGate.ts) BEFORE
        // flipping React state — the tour has top priority and claims it
        // outright, pre-empting anything else. This happens synchronously,
        // in the same tick as every other check above, so any other
        // self-launching popup whose own effect runs later in this same
        // commit (children fire before parents — see that file's own
        // comment) reliably sees the tour already owns the slot, never a
        // stale "nothing's showing yet."
        claimTour();
        setVariant(built.variant);
        setStops(built.stops);
        setStepIndex(0);
        setActive(true);
      },
      next: () => {
        setStepIndex((i) => {
          if (i >= stops.length - 1) {
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
      getTargetNode,
      // Clears the persisted flag and immediately restarts the tour in one
      // shot — admin dev-preview only (see SidebarDrawer's "RESET SPOTLIGHT
      // TOUR (DEV)" control). Writes false to the DB, same as `completed`
      // itself now does everywhere else. Rebuilds the stop list fresh each
      // time, same as a real start() — a dev previewing a different tier
      // between resets must see that tier's own variant, not whatever the
      // first preview happened to build.
      resetForTesting: () => {
        const built = buildStops();
        claimTour();
        markTourCompleted(false);
        setVariant(built.variant);
        setStops(built.stops);
        setStepIndex(0);
        setActive(true);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      active,
      stepIndex,
      variant,
      stops,
      completed,
      markTourCompleted,
      memberStateSettled,
      profileLoading,
      profileRefetching,
      membershipLoading,
      membershipRefetching,
      fullContentAccess,
    ]
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
