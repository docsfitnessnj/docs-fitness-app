import React, { useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { usePullToRefreshGesture } from '../lib/usePullToRefreshGesture';
import { INDICATOR_BOX_HEIGHT, PullToRefreshIndicator } from './PullToRefreshIndicator';

// Round 69: THE WAVE FILLS THE BELL.
//
// This file exists ONLY so Community gets pull-to-refresh without
// touching ScreenContainer.tsx (shared by the other three tab screens,
// which must stay byte-for-byte untouched) — the container/body/
// scrollContent styles below are a deliberate, documented duplication of
// ScreenContainer.tsx's own three style rules, kept in sync by hand, the
// same convention this app already uses elsewhere for two things that
// have to agree but can't share code across a runtime boundary (e.g.
// APP_URL/APP_SHARE_URL, the share card's own STANDARD_COLORWAY_IDS
// list). CommunityScreen.tsx's own diff is the single call site this
// round promises: swap `<ScreenContainer>` for
// `<CommunityPullToRefresh onRefresh={...}>`, nothing else about that
// screen's JSX structure changes. Reverting this round is one small diff:
// delete this file, PullToRefreshIndicator.tsx, and
// lib/usePullToRefreshGesture.ts, and put ScreenContainer back at that one
// call site.
const INDICATOR_AREA_HEIGHT = INDICATOR_BOX_HEIGHT + 20;

type Props = {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
};

export function CommunityPullToRefresh({ onRefresh, children }: Props) {
  const scrollRef = useRef<any>(null);
  const isFocused = useIsFocused();
  const { pullDistance, progress, phase } = usePullToRefreshGesture({
    scrollRef,
    enabled: isFocused,
    onRefresh,
  });

  return (
    <View style={styles.container}>
      {/*
        Round 69: the indicator must be revealed from its OWN bottom edge
        upward, the exact same direction the wave fill inside it rises --
        never clipped from the top (which would show the bell's handle
        first and hide the rising wave until the pull is nearly done, the
        opposite of the intended read). This outer box's own height is
        driven directly by pullDistance (clamped to
        INDICATOR_AREA_HEIGHT), with overflow:hidden; the inner box stays
        pinned to this outer box's own bottom edge at its full,
        unclamped height, so growing the outer box upward from zero
        uncovers the inner box's bottom portion first -- the same
        "overflow + fixed inner height" technique PullToRefreshIndicator
        itself already uses for the wave's own fill level, just applied
        one layer up, to the whole mark.
      */}
      <View
        testID="pull-to-refresh-area"
        pointerEvents="none"
        style={[styles.indicatorWrap, { height: Math.min(pullDistance, INDICATOR_AREA_HEIGHT), overflow: 'hidden' }]}
      >
        <View style={styles.indicatorInner}>
          <PullToRefreshIndicator progress={progress} refreshing={phase === 'refreshing'} />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        testID="community-scroll"
        style={[styles.body, pullDistance > 0 ? { transform: [{ translateY: pullDistance }] } : null]}
        contentContainerStyle={styles.scrollContent}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  indicatorWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  indicatorInner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: INDICATOR_AREA_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mirrors ScreenContainer.tsx's own `body`/`scrollContent` styles, plus
  // one deliberate addition ScreenContainer never needed: an explicit,
  // opaque backgroundColor here (not just on the outer `container`) so
  // this box never depends on whatever its own first child happens to
  // render for a solid background — the indicator itself is already
  // genuinely hidden at rest independent of this (indicatorWrap's own
  // height is clamped to pullDistance, which is 0 at rest), so this is
  // defense in depth, not the mechanism that hides it.
  body: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
});
