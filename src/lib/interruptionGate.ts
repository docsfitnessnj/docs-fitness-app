import { useSyncExternalStore } from 'react';

// THE RULE, APP WIDE: one self-launching interruption on screen at a time,
// ever. The spotlight tour, the free-tier upgrade nudge, the trial expiry
// warning, and anything else that can launch itself unprompted all read
// and write this ONE shared slot instead of each deciding independently —
// that's the only way to guarantee two of them can never render at once,
// stacked or otherwise, no matter which effect happens to fire first. The
// tour has top priority: it claims the slot outright (claimTour, below),
// never asks permission, and nothing else may show while it holds it.
//
// A plain module-level variable, not React state — same reasoning as
// checkoutRedirectGate.ts, which this mirrors: React fires effects
// children-before-parents within a single commit, so a child's effect
// (CommunityScreen's own tour.start() on mount) can claim the slot before
// a parent's sibling effect (the upgrade nudge's own mount effect) has any
// chance to see that through its own stale, same-commit closure of React
// state. A module value has no such ordering problem — every reader
// always sees the true, up-to-the-instant owner, checked synchronously at
// the exact moment it's about to show something, never "show now, hide a
// moment later."
export type InterruptionKind = 'tour' | 'upgradeNudge' | 'trialExpiry';

let owner: InterruptionKind | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getInterruptionOwner(): InterruptionKind | null {
  return owner;
}

// The tour is the one interruption allowed to claim the slot outright,
// pre-empting whatever (if anything) currently holds it — it is THE single
// gated entry point for the tour becoming active (see TourContext.start(),
// the only caller), so by the time anything else can observe the slot,
// the tour already owns it. Idempotent: calling this while the tour
// already owns the slot is a no-op, not a redundant notify.
export function claimTour(): void {
  if (owner === 'tour') return;
  owner = 'tour';
  notify();
}

// Whether a non-tour interruption is free to show itself right now — false
// while the tour owns the slot, or while anything else already does.
// Every self-launching popup besides the tour must check this
// synchronously, immediately before it would otherwise show itself, and
// only proceed on true — never cache the answer, never check it earlier
// and act on it later.
export function canShowInterruption(kind: Exclude<InterruptionKind, 'tour'>): boolean {
  return owner === null || owner === kind;
}

// Claims the slot for a non-tour interruption — call only right after
// canShowInterruption(kind) returned true, in the same synchronous pass
// (never after an await or a render), so nothing else can slip in between
// the check and the claim.
export function claimInterruption(kind: Exclude<InterruptionKind, 'tour'>): void {
  if (owner === kind) return;
  owner = kind;
  notify();
}

// Releases the slot — call the moment an interruption is actually
// dismissed or no longer eligible (never on a timer, never
// speculatively). Only clears the slot if the caller is still the current
// owner, so a stale release from something that already lost the slot to
// someone else (the tour pre-empting it) can't clobber whatever's showing
// now.
export function releaseInterruption(kind: InterruptionKind): void {
  if (owner !== kind) return;
  owner = null;
  notify();
}

// Round 31: force-clears the slot regardless of who currently holds it --
// unlike releaseInterruption(kind), which only clears a slot the caller
// itself still owns. Call this from AuthContext's signOut(), where the
// whole signed-in session (and whatever self-launching popup happened to
// have claimed the slot) is ending; there's no "stale release clobbering
// the real current owner" risk to guard against here, because nothing
// legitimately owns this slot once the member is signed out.
export function releaseAllInterruptions(): void {
  owner = null;
  notify();
}

export function subscribeInterruptionGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// React's own tool for exactly this: a value that lives outside React and
// can change between renders for reasons React didn't cause — subscribing
// this way (rather than useState+useEffect) means a change is never missed
// even if it happens between a component's render and its effects running.
export function useInterruptionOwner(): InterruptionKind | null {
  return useSyncExternalStore(subscribeInterruptionGate, getInterruptionOwner);
}
