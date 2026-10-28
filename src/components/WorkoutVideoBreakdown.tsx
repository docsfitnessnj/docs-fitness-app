import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MovementVideoPlayer } from './movement/MovementVideoPlayer';
import { extractYoutubeId } from '../lib/youtubeUrl';
import { colors, fonts } from '../theme';

type Props = {
  videoUrl?: string;
};

// Round 40: matched against the owner's approved reference-wod-screen.png.
// The reference shows a DESIGNED cover -- a solid green gradient with a
// centered play button and a dark "WATCH THE BREAKDOWN" tag -- never a real
// YouTube thumbnail photo, so the YouTube hqdefault.jpg fetch from Round 39
// is gone. Same in-app playback handoff as before: tapping swaps to
// MovementVideoPlayer (THE MOVEMENT VAULT's own nocookie-embed-with-retry
// treatment), used identically by DayPanel.tsx (Community's own expanded
// daily workout) and DocsWodsScreen.tsx (the WODS tab). Renders nothing at
// all when there's no video, same as before. The reference's own tag text
// includes a sample duration ("· 2 MIN") that has no real data behind it in
// this app's model -- per the round's own "match the design, not the
// sample content" instruction, the tag omits a duration rather than
// inventing one.
const GREEN_GRADIENT = {
  backgroundImage: `linear-gradient(135deg, ${colors.greenDeep}, ${colors.green})`,
} as object;

export function WorkoutVideoBreakdown({ videoUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  if (!videoUrl) return null;
  const youtubeId = extractYoutubeId(videoUrl);

  if (playing) {
    return <MovementVideoPlayer video={youtubeId ? { type: 'youtube', youtubeId } : null} />;
  }

  return (
    <Pressable
      style={[styles.thumb, GREEN_GRADIENT]}
      onPress={() => setPlaying(true)}
      testID="watch-video-breakdown"
      accessibilityLabel="Watch the breakdown"
    >
      <View style={styles.playCircle}>
        <Ionicons name="play" size={26} color={colors.green} />
      </View>
      <View style={styles.tag}>
        <Text style={styles.tagText}>WATCH THE BREAKDOWN</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    marginBottom: 14,
  },
  playCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E7ECE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: '#0F2922',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
});
