import React, { useEffect } from 'react';
import { Platform, View, ViewStyle } from 'react-native';

type Props = {
  size: number;
  // The visible stroke's own thickness, as a plain px number.
  strokeWidth: number;
  // 0-1. Ignored (the sweep is driven by the indeterminate spin instead)
  // when indeterminate is true.
  progress?: number;
  // When true, a continuous CSS spin stands in for a real fraction --
  // real upload progress that genuinely isn't available yet (no session
  // token for the progress-tracked XHR, the one documented fallback case
  // uploadFileWithProgress's own callers already handle), never a
  // decorative default.
  indeterminate?: boolean;
  color: string;
  // The color painted inside the ring's own hole -- match whatever sits
  // behind the control at rest (its own normal fill, or the surrounding
  // page/card background) so the sweep reads as a genuine ring, not a
  // solid disc with a dim halo.
  trackColor: string;
};

const KEYFRAMES_ID = 'docs-fitness-story-ring-spin';
const ANIMATION_NAME = 'docsFitnessStoryRingSpin';

// Round 67: a real, driven-by-real-progress circular stroke, replacing the
// plain ActivityIndicator spinner the story ring's own ADD affordance used
// since Round 66 -- "driven by real upload progress, not a fake spinner"
// (see StoriesContext.tsx's own uploadProgress state, wired through
// uploadFileWithProgress exactly as useGroupChat.ts's own video upload
// already does). Built as two plain, layered circles with a CSS
// conic-gradient sweep, the same "no new dependency, CSS does the real
// work" convention ChallengeVideoCover's own gradient and GlowPulseWrap's
// own injected @keyframes already established -- this app has no
// react-native-svg dependency, and this is a genuinely web-only mechanism
// anyway (this app's real deployment target), so a plain CSS conic-gradient
// is reused rather than adding one just for this.
function injectSpinKeyframes() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  // Starts from the same -90deg (12 o'clock) base the deterministic sweep
  // below is rotated to, so there's no visible jump the one time a fresh
  // upload happens to start in the indeterminate state before its first
  // real progress event arrives.
  style.textContent = `@keyframes ${ANIMATION_NAME} { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }`;
  document.head.appendChild(style);
}

export function CircularProgressRing({ size, strokeWidth, progress = 0, indeterminate = false, color, trackColor }: Props) {
  useEffect(() => {
    injectSpinKeyframes();
  }, []);

  if (Platform.OS !== 'web') {
    // Native has no CSS conic-gradient to draw this with, and this app's
    // real deployment target is the web export -- a plain, static disc in
    // the track color is a harmless, non-broken fallback rather than a
    // half-built native-only code path for a mechanism nothing exercises.
    return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: trackColor }} />;
  }

  const angle = indeterminate ? 0 : Math.max(0, Math.min(1, progress)) * 360;
  const sweepCss = indeterminate
    ? `conic-gradient(${color} 0deg 90deg, rgba(255,255,255,0.3) 90deg 360deg)`
    : `conic-gradient(${color} 0deg ${angle}deg, rgba(255,255,255,0.3) ${angle}deg 360deg)`;

  const outerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: sweepCss,
    transform: indeterminate ? undefined : [{ rotate: '-90deg' }],
    animationName: indeterminate ? ANIMATION_NAME : undefined,
    animationDuration: indeterminate ? '900ms' : undefined,
    animationTimingFunction: indeterminate ? 'linear' : undefined,
    animationIterationCount: indeterminate ? 'infinite' : undefined,
  } as unknown as ViewStyle;

  const innerSize = Math.max(0, size - strokeWidth * 2);

  return (
    <View testID="story-upload-progress-ring" style={outerStyle}>
      <View style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2, backgroundColor: trackColor }} />
    </View>
  );
}
