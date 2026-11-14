import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from '../../theme';

export type Testimonial = { name: string; quote: string };

// Round 55: the real reason a wheel/trackpad scroll over this carousel did
// nothing to the page, even though it never scrolls vertically at all.
// Confirmed directly (Playwright's own real wheel-event dispatch, not
// guessed): react-native-web's own horizontal ScrollView always sets
// `overflowX: 'auto', overflowY: 'hidden'` on its real scroll node
// (ScrollView/index.js's own `baseHorizontal` style) -- `overflow-y:
// hidden` alone, Round 38's own fix for the editor textarea, is NOT enough
// here, because the browser still treats this node as a genuine SCROLL
// CONTAINER (its horizontal axis really does scroll) and, combined with
// index.html's universal `* { overscroll-behavior-y: contain }` rule,
// claims the vertical wheel delta at this element and refuses to let it
// chain up to the document -- the identical Round 38 shape (a scroll
// container with zero room in one axis swallowing that axis's gesture),
// just triggered by the OTHER axis genuinely scrolling rather than by
// overflow-y:auto with nothing to scroll. The fix is the narrowest
// possible override, scoped to this one ScrollView's own style prop, not
// a change to the universal rule: `overscrollBehaviorY: 'auto'` is a real,
// first-class react-native-web style property (confirmed directly in
// node_modules/react-native-web/dist/exports/View/types.js.flow, not an
// unknown-CSS-property guess) that tells the browser this specific
// element's own vertical overscroll may chain up normally, while its
// horizontal paging/swipe behavior -- which never touches this property
// at all -- is completely unaffected.
const webOverscrollFix = { overscrollBehaviorY: 'auto' } as object;

type Props = {
  testimonials: Testimonial[];
  width: number;
  // Round 55: the same desktop-breakpoint convention AboutScreen.tsx's own
  // Round 49 desktop variant already uses, threaded in as a plain prop
  // rather than this component re-deriving its own width check -- one
  // source of truth for "is this desktop" stays in the screen.
  isDesktop?: boolean;
};

// FROM THE CREW -- a real horizontal-paging ScrollView (RN's own
// `pagingEnabled`, the standard cross-platform carousel technique, works on
// web exactly the same as native: the browser's own touch/trackpad/mouse
// horizontal scroll drives it directly, no PanResponder of its own). The
// dots are ALSO independently tappable, jumping straight to that slide --
// a second, equally real way to reach the same state a swipe reaches, not
// a bypass of it: both paths funnel through the identical `goTo`/index
// state, so whichever one a person (or a test) uses, the dot row and the
// currently-visible quote always agree.
export function TestimonialCarousel({ testimonials, width, isDesktop }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(testimonials.length - 1, i));
    setIndex(clamped);
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    goTo(i);
  };

  if (width <= 0) return null;

  return (
    <View testID="about-testimonial-carousel" style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={[{ width }, webOverscrollFix]}
      >
        {testimonials.map((t, i) => (
          <View key={t.name} style={[styles.slide, { width }]} testID={`about-testimonial-${i}`}>
            <Text style={[styles.quoteMark, isDesktop && styles.quoteMarkDesktop]}>&#8220;</Text>
            <Text style={[styles.quoteText, isDesktop && styles.quoteTextDesktop]}>{t.quote}</Text>
            <Text style={[styles.name, isDesktop && styles.nameDesktop]}>{t.name}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots} testID="about-testimonial-dots">
        {testimonials.map((t, i) => (
          <Pressable
            key={t.name}
            hitSlop={8}
            onPress={() => goTo(i)}
            style={[styles.dot, i === index && styles.dotActive]}
            testID={`about-testimonial-dot-${i}`}
            accessibilityLabel={`Show testimonial from ${t.name}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Round 55: centers the whole carousel block (the width-constrained
  // ScrollView, which previously had no alignment of its own and so sat
  // flush against the left edge of this full-width outer View) within the
  // desktop content column. A no-op on phone, where the ScrollView's own
  // `width` already equals this View's full available width, so centering
  // a box that's already exactly as wide as its parent changes nothing.
  // The dots row's own appearance is unaffected either way: it has no
  // explicit width of its own, so it already rendered centered under the
  // carousel (via its own internal justifyContent:'center') before this
  // change, and still does after it.
  root: {
    alignItems: 'center',
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  quoteMark: {
    color: colors.gold,
    fontFamily: fonts.headline,
    fontSize: 44,
    lineHeight: 44,
    marginBottom: 2,
  },
  quoteMarkDesktop: {
    fontSize: 60,
    lineHeight: 60,
  },
  quoteText: {
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 18,
  },
  quoteTextDesktop: {
    fontSize: 26,
    lineHeight: 36,
    marginBottom: 22,
  },
  name: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 2,
  },
  nameDesktop: {
    fontSize: 16,
    letterSpacing: 2.4,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: colors.goldBright,
  },
});
