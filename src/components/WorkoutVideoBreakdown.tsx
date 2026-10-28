import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MovementVideoPlayer } from './movement/MovementVideoPlayer';
import { extractYoutubeId } from '../lib/youtubeUrl';
import { colors, fonts } from '../theme';

type Props = {
  videoUrl?: string;
};

// Round 39: replaces WatchVideoBreakdownButton (an external-link button
// that always opened YouTube in a new tab) with a real video thumbnail —
// the YouTube-hosted cover image, tapped to play in-app via the SAME
// treatment THE MOVEMENT VAULT already uses (MovementVideoPlayer: a
// youtube-nocookie embed with load-timeout retry and an always-visible
// reload button). Doc's WOD/COW `videoUrl` is a raw pasted link, not a
// pre-parsed id, so extractYoutubeId() (lib/youtubeUrl.ts) is the one
// shared conversion step. Used identically by DayPanel.tsx (Community's
// own expanded daily workout) and DocsWodsScreen.tsx (the WODS tab) so
// both screens render "the same video treatment" by construction, not by
// each hand-matching the other's styling. Renders nothing at all when
// there's no video, same as the button it replaces.
export function WorkoutVideoBreakdown({ videoUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  if (!videoUrl) return null;
  const youtubeId = extractYoutubeId(videoUrl);

  if (playing) {
    return <MovementVideoPlayer video={youtubeId ? { type: 'youtube', youtubeId } : null} />;
  }

  return (
    <Pressable
      style={styles.thumb}
      onPress={() => setPlaying(true)}
      testID="watch-video-breakdown"
      accessibilityLabel="Watch video breakdown"
    >
      {youtubeId ? (
        <Image
          source={{ uri: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` }}
          style={styles.thumbImage}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.overlay} />
      <View style={styles.playCircle}>
        <Ionicons name="play" size={22} color={colors.white} />
      </View>
      <Text style={styles.label}>WATCH VIDEO BREAKDOWN</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  thumbImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5,76,61,0.35)',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
