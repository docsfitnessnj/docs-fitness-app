import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openVideoBreakdown } from '../lib/links';
import { colors, fonts } from '../theme';

type Props = {
  videoUrl?: string;
};

// The one, unmissable way to watch a workout's breakdown video — a full
// width primary button directly below the title, sized and styled like
// the app's other primary buttons (e.g. POST SCORE), never a small link.
// Renders nothing at all when there's no video, rather than a dead or
// disabled button.
export function WatchVideoBreakdownButton({ videoUrl }: Props) {
  if (!videoUrl) return null;
  return (
    <Pressable style={styles.button} onPress={() => openVideoBreakdown(videoUrl)} testID="watch-video-breakdown">
      <Ionicons name="play-circle" size={20} color={colors.greenDeep} />
      <Text style={styles.text}>WATCH VIDEO BREAKDOWN</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 12,
  },
  text: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
