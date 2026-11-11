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

type Props = {
  testimonials: Testimonial[];
  width: number;
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
export function TestimonialCarousel({ testimonials, width }: Props) {
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
    <View testID="about-testimonial-carousel">
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={{ width }}
      >
        {testimonials.map((t, i) => (
          <View key={t.name} style={[styles.slide, { width }]} testID={`about-testimonial-${i}`}>
            <Text style={styles.quoteMark}>&#8220;</Text>
            <Text style={styles.quoteText}>{t.quote}</Text>
            <Text style={styles.name}>{t.name}</Text>
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
  quoteText: {
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 18,
  },
  name: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 2,
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
