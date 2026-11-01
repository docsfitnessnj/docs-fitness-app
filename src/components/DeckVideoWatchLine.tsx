import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MovementVideoPlayer } from './movement/MovementVideoPlayer';
import { extractYoutubeId } from '../lib/youtubeUrl';
import { colors, fonts } from '../theme';

type Props = {
  videoUrl?: string;
};

// Round 41, Part 2: by owner decision, final -- deck cards do NOT get a
// designed video cover like ChallengeVideoCover/WorkoutVideoBreakdown; the
// playing card face stays the design. A card with a video instead gets one
// compact, quiet, single-line tappable row -- a small play glyph plus
// WATCH THE BREAKDOWN in letterspaced condensed caps green. Renders
// nothing at all when there's no video, same as the button it replaces.
// Tapping swaps in place to the same in-app MovementVideoPlayer treatment
// (the nocookie embed with load-timeout retry) every other video in the
// app already uses -- never a new, card-specific player.
export function DeckVideoWatchLine({ videoUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  if (!videoUrl) return null;
  const youtubeId = extractYoutubeId(videoUrl);

  if (playing) {
    return <MovementVideoPlayer video={youtubeId ? { type: 'youtube', youtubeId } : null} />;
  }

  return (
    <Pressable
      style={styles.row}
      onPress={() => setPlaying(true)}
      testID="deck-watch-video-breakdown"
      accessibilityLabel="Watch the breakdown"
    >
      <Ionicons name="play-circle" size={16} color={colors.green} />
      <Text style={styles.text}>WATCH THE BREAKDOWN</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  text: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
});
