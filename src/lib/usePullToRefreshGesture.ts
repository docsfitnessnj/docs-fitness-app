import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Round 69: THE WAVE FILLS THE BELL — a from-scratch, fully self-contained
// pull-to-refresh gesture for the Community feed.
//
// FENCE 3 (touch listeners attach only to the feed's own scroll container,
// only while Community is active, fully torn down otherwise): every
// listener below is attached directly to the real DOM node handed in via
// `scrollRef` — never `document`/`window`/`body` — inside an effect keyed
// on `enabled` (the caller passes `isFocused` from
// @react-navigation/native). The effect's own cleanup removes every
// listener; `onRefresh` is read through a ref rather than closed over
// directly, specifically so the effect's dependency array never churns
// just because an upstream context's own refetch identity changes on
// every new post/story (confirmed directly: CommunityContext's `refetch`
// is rebuilt inside a useMemo keyed on `rows`, so it's a fresh function on
// nearly every render) — the attach/detach lifecycle this fence cares
// about is tied to tab focus alone, not to that unrelated churn.
//
// FENCE 4 (disarmed whenever the keyboard shell is open, any overlay/
// modal/story viewer/composer is open, or the feed isn't at exact scroll
// top): a covering overlay (AppModal's portal, ScreenOverlay's absoluteFill,
// StoryViewer's own absoluteFill root) is an opaque, higher-stacking-order
// DOM node directly on top of this screen — ordinary browser hit-testing
// means a touch that starts on one of those never reaches this listener
// at all, so most of this fence is already true by construction, with no
// extra state needed. The one state this can't infer from DOM coverage
// alone is the keyboard shell (`data-keyboard-shell` on <html>, set by
// public/index.html's own untouched mechanism — see keyboardShellOpen()
// below, a read-only check, never a write) and "exact scroll top"
// (`el.scrollTop === 0`, checked live at the moment a gesture would arm).
//
// Per the round's own hard fence 1, nothing here touches
// public/index.html, the keyboard shell mechanism itself, the editor
// caret/drag mechanisms, the viewport lock, the overscroll rules, or the
// safe-area system — this hook only ever READS the one existing,
// documented `data-keyboard-shell` attribute those files already
// maintain.

export type PullToRefreshPhase = 'idle' | 'refreshing' | 'settling';

// How much RESISTED pull distance (not raw finger travel) arms a refresh
// on release.
export const PULL_TO_REFRESH_THRESHOLD = 70;

// The resisted distance asymptotically approaches but never exceeds this,
// regardless of how far the raw finger travels — "gentle, progressively
// stronger resistance" without a hard clamp.
const MAX_PULL = 110;

// Raw (unresisted) px of movement before this gesture decides whether a
// touch is a vertical pull-to-refresh or something else (an ordinary
// scroll, a horizontal swipe on a nested carousel, a tap) — once decided,
// that classification is locked for the rest of this one touch sequence.
const DIRECTION_DEADZONE = 8;

// A hung refetch can never pin the indicator open past this.
const MAX_REFRESH_MS = 8000;

const SPRING_BACK_MS = 240;
const DOCK_SNAP_MS = 160;
const SETTLE_AWAY_MS = 240;

function keyboardShellOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-keyboard-shell') === 'open';
}

function applyResistance(rawDelta: number): number {
  if (rawDelta <= 0) return 0;
  return MAX_PULL * (1 - Math.exp(-rawDelta / MAX_PULL));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// A tiny, dependency-free "animate this number toward a target" tween —
// deliberately not React Native's Animated API (which Round 49 found
// silently produces no visible effect for the `shadow*` style family on
// web) and not a CSS transition/keyframe (this value drives a plain
// numeric style recomputed every frame, the same "driven by React state"
// model as the live drag itself, so there's exactly one mental model for
// the whole gesture rather than two).
function animateValue(
  from: number,
  to: number,
  durationMs: number,
  onUpdate: (value: number) => void,
  onDone?: () => void
): () => void {
  const start = Date.now();
  let raf = 0;
  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / durationMs);
    onUpdate(from + (to - from) * easeOutCubic(t));
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

type Options = {
  scrollRef: React.RefObject<any>;
  enabled: boolean;
  onRefresh: () => Promise<void>;
};

type Result = {
  // Resisted pull distance in px — the caller applies this directly as a
  // translateY on the scrolled content, so it visually "follows the
  // finger with gentle resistance" 1:1 during an active drag.
  pullDistance: number;
  // 0..1 — pullDistance normalized against the threshold, clamped. Feeds
  // the indicator's own wave-fill level.
  progress: number;
  phase: PullToRefreshPhase;
};

export function usePullToRefreshGesture({ scrollRef, enabled, onRefresh }: Options): Result {
  const [pullDistance, setPullDistanceState] = useState(0);
  const pullDistanceRef = useRef(0);
  const setPullDistance = useCallback((v: number) => {
    pullDistanceRef.current = v;
    setPullDistanceState(v);
  }, []);

  const [phase, setPhaseState] = useState<PullToRefreshPhase>('idle');
  const phaseRef = useRef<PullToRefreshPhase>('idle');
  const setPhase = useCallback((p: PullToRefreshPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const cancelAnimRef = useRef<(() => void) | null>(null);
  const stopAnim = useCallback(() => {
    cancelAnimRef.current?.();
    cancelAnimRef.current = null;
  }, []);

  const springTo = useCallback(
    (to: number, durationMs: number, onDone?: () => void) => {
      stopAnim();
      cancelAnimRef.current = animateValue(pullDistanceRef.current, to, durationMs, setPullDistance, () => {
        cancelAnimRef.current = null;
        onDone?.();
      });
    },
    [setPullDistance, stopAnim]
  );

  const runRefresh = useCallback(() => {
    setPhase('refreshing');
    springTo(PULL_TO_REFRESH_THRESHOLD, DOCK_SNAP_MS);

    let settled = false;
    const finish = () => {
      if (settled || !mountedRef.current) return;
      settled = true;
      setPhase('settling');
      springTo(0, SETTLE_AWAY_MS, () => {
        if (mountedRef.current) setPhase('idle');
      });
    };

    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, MAX_REFRESH_MS);
    });

    Promise.race([onRefreshRef.current(), timeout])
      .catch(() => {
        // A failed refetch is still a settled refresh as far as this
        // gesture is concerned — the underlying context's own error
        // handling (if any) owns surfacing that; this hook's only job is
        // to never get stuck open.
      })
      .finally(finish);
  }, [setPhase, springTo]);

  // Internal, per-touch bookkeeping — read/written only inside the native
  // event handlers below, never used for rendering, so a plain ref (not
  // state) is correct here.
  const gestureRef = useRef<{
    locked: 'pending' | 'vertical' | 'other';
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!enabled) return;
    const el: HTMLElement | null = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current !== 'idle') {
        gestureRef.current = null;
        return;
      }
      if (e.touches.length !== 1) {
        gestureRef.current = null;
        return;
      }
      const atTop = el.scrollTop === 0 && !keyboardShellOpen();
      gestureRef.current = {
        locked: atTop ? 'pending' : 'other',
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (!g || g.locked === 'other') return;
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;

      if (g.locked === 'pending') {
        if (Math.abs(dx) < DIRECTION_DEADZONE && Math.abs(dy) < DIRECTION_DEADZONE) return;
        const isVerticalPull = dy > 0 && Math.abs(dy) > Math.abs(dx);
        g.locked = isVerticalPull ? 'vertical' : 'other';
        if (g.locked === 'other') return;
      }

      // g.locked === 'vertical' from here on.
      if (keyboardShellOpen()) {
        // The keyboard opened mid-drag (e.g. an input elsewhere gained
        // focus) — bail out silently rather than fight a shell resize
        // mid-gesture; this touch sequence stops acting as a pull for its
        // remainder, and whatever was already pulled springs back.
        g.locked = 'other';
        springTo(0, SPRING_BACK_MS);
        return;
      }
      e.preventDefault();
      setPullDistance(applyResistance(Math.max(0, dy)));
    };

    const onTouchEnd = () => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.locked !== 'vertical') return;
      if (pullDistanceRef.current >= PULL_TO_REFRESH_THRESHOLD) {
        runRefresh();
      } else {
        springTo(0, SPRING_BACK_MS);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      // A drag mid-flight when the tab loses focus (or this screen
      // unmounts) has no touchend left to resolve it — snap back
      // immediately rather than leave the content visibly stuck
      // translated down with nothing left listening to release it.
      if (gestureRef.current?.locked === 'vertical') {
        stopAnim();
        setPullDistance(0);
      }
      gestureRef.current = null;
    };
  }, [enabled, scrollRef, runRefresh, springTo, setPullDistance, stopAnim]);

  const progress = Math.max(0, Math.min(1, pullDistance / PULL_TO_REFRESH_THRESHOLD));
  return { pullDistance, progress, phase };
}
