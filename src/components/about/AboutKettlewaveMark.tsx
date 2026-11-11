import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';

const KETTLEWAVE = require('../../../assets/brand/kettlewave-green.png');
// Real pixel size of the source art (confirmed directly via a one-off PIL
// inspection before relying on it) -- used only to derive a render box with
// the asset's own true proportions, never guessed.
const KETTLEWAVE_RATIO = 219 / 311;

const MARK_WIDTH = 560;
const MARK_HEIGHT = MARK_WIDTH / KETTLEWAVE_RATIO;

// Mechanical white recolor: brightness(0) drives every opaque pixel to pure
// black while leaving the PNG's own alpha shape completely untouched, then
// invert(1) flips that black to white -- the same "recolor by filter, never
// redraw" principle this app already uses for the kettlewave elsewhere (see
// shareCardRender.ts's getTintedKettlewave, which reaches for a canvas
// composite instead only because it needs an arbitrary hex per colorway,
// not just a single flat white). Web-only CSS; this mark is cosmetic and
// this app's real target is web (see AGENTS.md), so native simply renders
// the original green art rather than failing to build.
const WHITE_FILTER = Platform.OS === 'web' ? ({ filter: 'brightness(0) invert(1)' } as object) : {};

// `fixed` is anchored to the real browser viewport specifically because the
// pre-signup shell runs no transform on any ancestor while signedUp is
// false (see useWebDocumentScroll.ts) -- a transformed ancestor would
// otherwise redefine the containing block for a `fixed` descendant and
// defeat the entire point of this mark staying put while content scrolls.
const FIXED_POSITION = Platform.OS === 'web' ? ({ position: 'fixed' } as object) : {};

// Round 49: the About page's own barely-there, fixed backdrop mark. A
// sibling of the scrolling content, not a child of it -- same convention as
// any other screen-wide fixed/overlay element in this app (DebugOverlay,
// AlertHost) that must stay independent of whatever is scrolling
// underneath. Deliberately low opacity and `pointerEvents="none"`: it must
// never win a tap meant for the real content above it, and must never read
// as competing with it -- only as quiet, living texture behind it.
export function AboutKettlewaveMark() {
  return (
    <View style={[styles.mark, FIXED_POSITION]} pointerEvents="none" testID="about-kettlewave-mark">
      <Image source={KETTLEWAVE} resizeMode="contain" style={[styles.image, WHITE_FILTER]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    position: 'absolute', // overridden by FIXED_POSITION on web
    top: '34%',
    left: '50%',
    width: MARK_WIDTH,
    height: MARK_HEIGHT,
    opacity: 0.1,
    zIndex: 0,
    transform: [
      { translateX: -MARK_WIDTH / 2 },
      { translateY: -MARK_HEIGHT / 2 },
      { rotate: '-12deg' },
    ],
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
