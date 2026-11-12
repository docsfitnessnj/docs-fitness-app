import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';

// Round 51 (owner decision, final): both kettlewave background marks are
// removed entirely -- a real iPhone test found them a distraction. No
// background kettlebell imagery anywhere on the About page anymore, at any
// opacity. The committed assets/brand/kettlewave-filled.png asset itself is
// untouched in the repo (it may be used elsewhere later); only this
// backdrop stops rendering it, so the import and every mark-specific style
// below are deleted outright rather than left dormant.

// Round 51: the sheen upgrades from Round 50's single top-down radial to
// the approved two-glow design (design-references/bg-E4.png, confirmed via
// direct pixel sampling before implementing -- the top-center sample read
// exactly #1BBA93, matching this gradient's own first stop, and a vertical
// sweep down the bottom third brightened steadily toward the physical
// bottom edge, confirming the real rising glow rather than a flat fade).
// Two layered radial-gradients, CSS-only (the same unconditional `as
// object` style-cast `ChallengeVideoCover`'s own gradient already
// established) -- a brighter, wider spotlight pouring down from the very
// top (the second, lower layer) plus a soft glow rising from the bottom
// center (the first, upper layer, painted on top since CSS stacks
// comma-separated background-image layers front-to-back in the order
// listed). "Never darker than #054C3D anywhere, no vignette" is still true
// by construction: the top gradient's own last color stop IS #054C3D, and
// the bottom gradient's own last stop is fully transparent (rgba(...,0)),
// which only ever lightens whatever the top gradient already painted
// beneath it -- there is no stop in either gradient capable of producing
// anything darker than the base #054C3D. Percentage-sized (not px) so both
// layers scale correctly to any real device viewport, exactly as Round 50's
// own single gradient already did.
const SHEEN_GRADIENT = {
  backgroundImage:
    'radial-gradient(ellipse 120% 55% at 50% 104%, rgba(25,180,142,0.42) 0%, rgba(25,180,142,0) 60%), ' +
    'radial-gradient(ellipse 150% 85% at 50% 0%, #1BBA93 0%, #0C8B6C 32%, #076652 58%, #054C3D 85%)',
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
// The fix is structural, not a patch: there is exactly ONE fixed,
// viewport-bound box (this one, `top/left/right/bottom: 0`) and it carries
// `overflow: hidden`. Round 51 removed the two mark children this
// guarantee was originally built to contain, but the guarantee itself is
// still load-bearing for the backdrop's own gradient layers (which, per
// the sheen comment above, are already sized well past 100% on both axes)
// -- this remains a structural guarantee, not a size that merely happens
// to fit today.
export function AboutBackdrop() {
  return (
    <View
      style={[styles.wrap, FIXED_POSITION, SHEEN_GRADIENT]}
      pointerEvents="none"
      testID="about-kettlewave-mark"
    />
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
});
