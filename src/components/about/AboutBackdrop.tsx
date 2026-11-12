import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';

const KETTLEWAVE_FILLED = require('../../../assets/brand/kettlewave-filled.png');
// Real pixel size of the committed asset (confirmed directly before relying
// on it) -- already pure white with alpha (the "filled" mark, handle hole
// open), so unlike Round 49's own kettlewave-green.png this needs no
// recolor filter at all, just opacity.
const KETTLEWAVE_RATIO = 219 / 311;

const MARK_TOP_RIGHT_WIDTH = 250;
const MARK_BOTTOM_LEFT_WIDTH = 290;

// Round 50: the radial sheen, replacing Round 49's flat colors.greenDeep
// fill. CSS-only (the same unconditional `as object` cast ChallengeVideoCover
// already established for its own gradient) -- a radial-gradient's own
// color stops never produce anything darker than its last stop, and
// nothing past 100% is ever rendered, so "never darker than #054C3D
// anywhere" is true by construction as long as that's the final stop, with
// no vignette layered on top. Percentage-sized (not px) so it scales
// correctly to any real device viewport rather than being calibrated to
// one specific screen height.
const SHEEN_GRADIENT = {
  backgroundImage: 'radial-gradient(ellipse 140% 85% at 50% 0%, #0E8A6E 0%, #076652 45%, #054C3D 85%)',
} as object;

// `fixed` anchors to the real browser viewport only where no transformed
// ancestor redefines the containing block -- true for the unclipped
// 'onboarding' shell (see useWebDocumentScroll.ts). Native has no
// `position: fixed`.
const FIXED_POSITION = Platform.OS === 'web' ? ({ position: 'fixed' } as object) : {};

// Round 50, Job 2 (the sideways drift): Round 49 gave its single kettlewave
// mark its OWN separate `position: fixed` box, sized larger than the
// viewport and intentionally bleeding past its own edges via a `left: 50%`
// + translateX offset -- confirmed directly to be the real cause of a real
// device's horizontal drag: a `position: fixed` element wider than the
// viewport does not, in spec, enlarge an ancestor's own scrollable area,
// but real mobile WebKit does not reliably hold to that for a fixed box
// positioned via left/transform with no containing clip, and the result
// was genuinely draggable empty space past the physical edges.
//
// The fix is structural, not a patch: there is now exactly ONE fixed,
// viewport-bound box (this one, `top/left/right/bottom: 0`) and it carries
// `overflow: hidden`. Both marks live INSIDE it as plain `position:
// absolute` children, positioned and sized to bleed off its own edges --
// but since the wrapper IS the viewport-exact box and clips its own
// overflowing children, nothing in this component can ever register as
// wider than the real viewport at the DOM level, regardless of how far a
// mark's own rotated/offset box would otherwise extend. This is a
// guarantee by construction, not a size that merely happens to fit today.
export function AboutBackdrop() {
  return (
    <View
      style={[styles.wrap, FIXED_POSITION, SHEEN_GRADIENT]}
      pointerEvents="none"
      testID="about-kettlewave-mark"
    >
      <Image
        source={KETTLEWAVE_FILLED}
        resizeMode="contain"
        style={styles.markTopRight}
        testID="about-mark-top-right"
      />
      <Image
        source={KETTLEWAVE_FILLED}
        resizeMode="contain"
        style={styles.markBottomLeft}
        testID="about-mark-bottom-left"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', // overridden by FIXED_POSITION on web
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: colors.greenDeep,
    zIndex: -1,
  },
  // Upper right, partially off the right edge -- a visible emblem sitting
  // in the open green above the hero, never centered behind a white card.
  markTopRight: {
    position: 'absolute',
    top: 20,
    right: -70,
    width: MARK_TOP_RIGHT_WIDTH,
    height: MARK_TOP_RIGHT_WIDTH / KETTLEWAVE_RATIO,
    opacity: 0.12,
    transform: [{ rotate: '10deg' }],
  },
  // Lower left, partially off both the left and bottom edges.
  markBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -90,
    width: MARK_BOTTOM_LEFT_WIDTH,
    height: MARK_BOTTOM_LEFT_WIDTH / KETTLEWAVE_RATIO,
    opacity: 0.12,
    transform: [{ rotate: '-9deg' }],
  },
});
