import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { TourTargetKey, useTour } from '../context/TourContext';
import { colors, fonts } from '../theme';

type Rect = { x: number; y: number; width: number; height: number };

type Stop = {
  key: TourTargetKey;
  title: string;
  body: React.ReactNode;
  // 'circle' hugs a round element (the story ring); a number is a fixed
  // corner radius for rectangular targets.
  radius: number | 'circle';
};

const STOPS: Stop[] = [
  {
    key: 'story-ring',
    title: "DOC'S DAILY STORY",
    body: 'Tap the gold ring any day for a quick video from Doc. New ring, new story.',
    radius: 'circle',
  },
  {
    key: 'date-strip',
    title: 'YOUR WEEK LIVES HERE',
    body: "Tap any date to sign up for class at Doc's Fitness or see Doc's Workout of the Day.",
    radius: 16,
  },
  {
    key: 'composer-bar',
    title: 'LOG IT. POST IT.',
    body: 'Every win posted here gets celebrated. PRs, first workouts, all of it. This community board runs on your wins.',
    radius: 18,
  },
  {
    key: 'tab-bar',
    title: 'THE FOUR ROOMS',
    body: (
      <>
        {"Community, Doc's WODs, The Challenge of the Week + Live Leaderboard and The Deck "}
        <Text style={{ color: colors.playingCardRed }}>♦</Text>
        <Text style={{ color: colors.text }}>♠</Text>
        <Text style={{ color: colors.playingCardRed }}>♥</Text>
        <Text style={{ color: colors.text }}>♣</Text>
        {'. Go explore.'}
      </>
    ),
    radius: 20,
  },
];

const SPOTLIGHT_PADDING = 10;
const CARD_GAP = 16;
const CARD_MARGIN = 16;
const SCREEN_EDGE_MARGIN = 20;
const NAV_BUTTON_WIDTH = 88;
const TRANSITION_MS = 400;
const CSS_TRANSITION = `left ${TRANSITION_MS}ms ease, top ${TRANSITION_MS}ms ease, width ${TRANSITION_MS}ms ease, height ${TRANSITION_MS}ms ease`;
const CSS_RADIUS_TRANSITION = `border-radius ${TRANSITION_MS}ms ease`;

export function TourOverlay() {
  const tour = useTour();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const [mounted, setMounted] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const stop = STOPS[tour.stepIndex];

  useEffect(() => {
    if (tour.active) {
      setMounted(true);
      Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.active]);

  useEffect(() => {
    if (!tour.active) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [tour.active, pulse]);

  useEffect(() => {
    if (!tour.active) return undefined;
    let cancelled = false;
    const measure = () => {
      const node = tour.getTargetNode(stop.key);
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, width, height) => {
          if (!cancelled) setRect({ x, y, width, height });
        });
      }
    };
    const id = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [tour.active, tour.stepIndex, stop.key, winWidth, winHeight]);

  if (!mounted) return null;

  let content: React.ReactNode = null;
  if (rect) {
    const spotLeft = rect.x - SPOTLIGHT_PADDING;
    const spotTop = rect.y - SPOTLIGHT_PADDING;
    const spotWidth = rect.width + SPOTLIGHT_PADDING * 2;
    const spotHeight = rect.height + SPOTLIGHT_PADDING * 2;
    const radius = stop.radius === 'circle' ? Math.min(spotWidth, spotHeight) / 2 : stop.radius;

    const roomBelow = winHeight - (rect.y + rect.height);
    const placeAbove = stop.key === 'tab-bar' || roomBelow < cardHeight + CARD_GAP + SCREEN_EDGE_MARGIN;
    const cardTop = placeAbove
      ? Math.max(SCREEN_EDGE_MARGIN, spotTop - cardHeight - CARD_GAP)
      : spotTop + spotHeight + CARD_GAP;

    const isLast = tour.stepIndex === STOPS.length - 1;

    content = (
      <>
        <View
          pointerEvents="none"
          style={
            {
              position: 'absolute',
              left: spotLeft,
              top: spotTop,
              width: spotWidth,
              height: spotHeight,
              transitionProperty: 'left, top, width, height',
              transitionDuration: `${TRANSITION_MS}ms`,
              transitionTimingFunction: 'ease',
            } as any
          }
        >
          <View
            style={
              [
                StyleSheet.absoluteFill,
                {
                  borderRadius: radius,
                  boxShadow: `0 0 0 3px ${colors.goldBright}, 0 0 22px 5px rgba(255,213,32,0.55), 0 0 0 9999px rgba(0,0,0,0.78)`,
                  transitionProperty: 'border-radius',
                  transitionDuration: `${TRANSITION_MS}ms`,
                  transitionTimingFunction: 'ease',
                },
              ] as any
            }
          />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: radius,
                borderWidth: 2,
                borderColor: colors.goldBright,
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) }],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
              },
            ]}
          />
        </View>

        <View
          style={
            [
              styles.card,
              {
                top: cardTop,
                left: CARD_MARGIN,
                right: CARD_MARGIN,
                transitionProperty: 'top',
                transitionDuration: `${TRANSITION_MS}ms`,
                transitionTimingFunction: 'ease',
              },
            ] as any
          }
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          testID="tour-card"
        >
          <View style={styles.topRow}>
            <Text style={styles.stepLabel}>
              {tour.stepIndex + 1} OF {STOPS.length}
            </Text>
            <Pressable onPress={tour.skip} hitSlop={8} testID="tour-skip">
              <Text style={styles.skipText}>SKIP</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{stop.title}</Text>
          <Text style={styles.body}>{stop.body}</Text>

          <View style={styles.bottomRow}>
            <View style={styles.backSlot}>
              {tour.stepIndex > 0 && (
                <Pressable style={[styles.navButton, styles.navButtonOutline]} onPress={tour.back} testID="tour-back">
                  <Text style={styles.navButtonTextOutline}>BACK</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.dotsRow}>
              {STOPS.map((s, i) => (
                <View key={s.key} style={[styles.dot, i === tour.stepIndex && styles.dotActive]} />
              ))}
            </View>

            <Pressable style={[styles.navButton, styles.navButtonSolid]} onPress={tour.next} testID="tour-next">
              <Text style={styles.navButtonTextSolid}>{isLast ? 'DONE' : 'NEXT'}</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  return (
    <Animated.View
      style={[styles.root, { opacity: overlayOpacity }]}
      pointerEvents={tour.active ? 'auto' : 'none'}
      testID="tour-overlay"
    >
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 9999,
  },
  card: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
  } as any,
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stepLabel: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  skipText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  body: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backSlot: {
    width: NAV_BUTTON_WIDTH,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairline,
  },
  dotActive: {
    backgroundColor: colors.gold,
  },
  navButton: {
    width: NAV_BUTTON_WIDTH,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonOutline: {
    borderWidth: 1.5,
    borderColor: colors.green,
    backgroundColor: 'transparent',
  },
  navButtonSolid: {
    backgroundColor: colors.green,
  },
  navButtonTextOutline: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  navButtonTextSolid: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
});
