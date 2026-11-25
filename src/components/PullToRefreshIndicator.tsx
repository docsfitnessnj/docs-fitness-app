import React, { useEffect } from 'react';
import { Image, Platform, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

// Round 70: THE GOLD RING AROUND THE BELL -- replaces Round 69's own
// wave-fill treatment. Per this round's own brief, this file is the ONLY
// thing that changes: the gesture, thresholds, and every fence from Round
// 69 (usePullToRefreshGesture.ts, CommunityPullToRefresh.tsx, and this
// component's own Props shape -- `progress`/`refreshing`, nothing added
// or removed) all stay byte for byte untouched, so this round's own diff
// is exactly as small and revertible as Round 69's was.
//
// The kettlewave bell (assets/brand/kettlewave-green.png) now renders as
// the plain brand-green outline mark ONLY -- no fill, no second,
// mechanically-recolored asset, no canvas compositing. Round 69's own
// kettlewave-filled.png tint (getTintedFillUri/resolveUri, mirroring
// shareCardRender.ts's getTintedKettlewave) is removed outright, along
// with the sine-slosh rAF loop that drove it -- nothing in this file
// reads that asset, or runs a JS animation loop, anymore.
//
// Around the bell, a single gold ring is drawn via one plain CSS
// conic-gradient sweep -- the same "no new dependency, CSS does the real
// work" technique CircularProgressRing.tsx (Round 67) already established
// for exactly this shape of problem (a determinate sweep that becomes an
// indeterminate spin), REPLICATED here rather than imported, per Round
// 69's own self-containment convention (see its own getTintedKettlewave
// comment) -- reverting this round is still just this one file, with
// nothing shared or entangled with a component another screen also
// renders.
//
// Two literal values are intentionally copied from
// CheckoutRedirectLoadingScreen.tsx's own spinnerTrack/spinnerArc -- the
// faint gold track color (`rgba(229, 184, 11, 0.16)`) and the 2600ms
// linear spin duration -- "matching the loading screen's own orbiting arc
// treatment" means genuine parity with those exact numbers, not a
// similar-looking guess. CircularProgressRing.tsx's own white-on-green
// track color and 900ms spin (tuned for the story-upload ring sitting on
// a solid green badge) are deliberately NOT reused here -- this ring sits
// on the page's own off-white background, and the brief names the
// loading screen, not the story ring, as the thing to match.

const KETTLEWAVE_OUTLINE = require('../../assets/brand/kettlewave-green.png');

// The real asset's own natural proportions (confirmed directly against
// the committed PNG) -- never squash or stretch this ratio. Unchanged
// from Round 69.
const KETTLEWAVE_RATIO = 219 / 311;
const BELL_WIDTH = 34;
const BELL_HEIGHT = Math.round(BELL_WIDTH / KETTLEWAVE_RATIO);

// The same additive padding CheckoutRedirectLoadingScreen.tsx's own
// `RING_SIZE = BADGE_SIZE + 22` uses around its badge, applied here
// around the bell's own taller dimension -- a circle has to be sized off
// one axis, and the bell is taller than it is wide.
const RING_SIZE = BELL_HEIGHT + 22;
const RING_THICKNESS = 2;
const RING_TRACK_COLOR = 'rgba(229, 184, 11, 0.16)';

// Exported box dimensions CommunityPullToRefresh.tsx's own
// `INDICATOR_AREA_HEIGHT = INDICATOR_BOX_HEIGHT + 20` reads -- kept as the
// same two names Round 69 exported, so that file needs zero changes. The
// ring is a circle, so both are the same value.
export const INDICATOR_BOX_WIDTH = RING_SIZE;
export const INDICATOR_BOX_HEIGHT = RING_SIZE;

const KEYFRAMES_ID = 'docs-fitness-pull-refresh-ring-spin';
const ANIMATION_NAME = 'docsFitnessPullRefreshRingSpin';
// Matches CheckoutRedirectLoadingScreen.tsx's own spin duration exactly
// -- "the same motion language as the app's loading screen ring."
const SPIN_DURATION_MS = 2600;
// The fixed bright-arc span the loading screen's own border-only
// treatment visually reads as (see that file's own spinnerArc comment) --
// replicated here via conic-gradient instead of a colored border edge,
// the same translation CircularProgressRing's own indeterminate mode
// already makes.
const SPIN_ARC_DEGREES = 90;

function injectSpinKeyframes() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  // Starts from the same -90deg (12 o'clock) base the determinate sweep
  // below is rotated to, so there's no visible jump the instant a
  // completed pull (progress === 1, a full static ring) hands off to the
  // spinning refresh state.
  style.textContent = `@keyframes ${ANIMATION_NAME} { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }`;
  document.head.appendChild(style);
}

type Props = {
  // 0..1 -- how far through the pull the member currently is (clamped by
  // the gesture hook before being handed to this component). Drives the
  // ring's own sweep angle directly: a short pull traces a partial arc,
  // progress === 1 (the threshold) completes the full circle.
  progress: number;
  // While true, the ring ignores `progress` (the gesture hook already
  // pins it at 1 for the whole refresh) and spins continuously instead --
  // "the completed ring spins smoothly" while a real refetch is in
  // flight, the same motion language as the app's loading screen ring.
  refreshing: boolean;
};

export function PullToRefreshIndicator({ progress, refreshing }: Props) {
  useEffect(() => {
    injectSpinKeyframes();
  }, []);

  if (Platform.OS !== 'web') {
    // This app's real deployment target is the web export -- there's no
    // CSS conic-gradient to draw the proportional ring with on native, so
    // a plain, static faint ring plus the bell is a harmless, non-broken
    // fallback (the same convention CircularProgressRing.tsx already
    // established for its own native branch) rather than a half-built
    // native-only code path for a mechanism nothing exercises.
    return (
      <View
        testID="pull-to-refresh-indicator"
        style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          testID="pull-to-refresh-ring"
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RING_SIZE / 2,
            borderWidth: RING_THICKNESS,
            borderColor: RING_TRACK_COLOR,
          }}
        />
        <Image source={KETTLEWAVE_OUTLINE} resizeMode="contain" style={{ width: BELL_WIDTH, height: BELL_HEIGHT }} />
      </View>
    );
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const sweepAngle = refreshing ? SPIN_ARC_DEGREES : clamped * 360;
  const sweepCss = `conic-gradient(${colors.gold} 0deg ${sweepAngle}deg, ${RING_TRACK_COLOR} ${sweepAngle}deg 360deg)`;
  const holeSize = RING_SIZE - RING_THICKNESS * 2;

  const ringStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundImage: sweepCss,
    transform: refreshing ? undefined : [{ rotate: '-90deg' }],
    animationName: refreshing ? ANIMATION_NAME : undefined,
    animationDuration: refreshing ? `${SPIN_DURATION_MS}ms` : undefined,
    animationTimingFunction: refreshing ? 'linear' : undefined,
    animationIterationCount: refreshing ? 'infinite' : undefined,
  } as unknown as ViewStyle;

  return (
    <View
      testID="pull-to-refresh-indicator"
      style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}
    >
      <View testID="pull-to-refresh-ring" pointerEvents="none" style={ringStyle}>
        <View
          style={{
            position: 'absolute',
            top: RING_THICKNESS,
            left: RING_THICKNESS,
            width: holeSize,
            height: holeSize,
            borderRadius: holeSize / 2,
            backgroundColor: colors.background,
          }}
        />
      </View>
      <Image source={KETTLEWAVE_OUTLINE} resizeMode="contain" style={{ width: BELL_WIDTH, height: BELL_HEIGHT }} />
    </View>
  );
}
