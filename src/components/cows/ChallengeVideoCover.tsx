import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MovementVideoPlayer } from '../movement/MovementVideoPlayer';
import { extractYoutubeId } from '../../lib/youtubeUrl';
import { colors, fonts } from '../../theme';

type Props = {
  videoUrl: string;
  title: string;
};

// Round 39, Part 2: the COW's own video is presented as a designed cover,
// not a raw video frame, so it looks intentional every week -- a flat
// list-of-movements style thumbnail (see WorkoutVideoBreakdown.tsx, used
// for Doc's WODs) would undersell a from-scratch weekly challenge the way
// a plain button already did. Gold-on-gold gradient, deep green text --
// the hero card around this stays the app's own green, so this is the one
// place on the COWS screen that's actually gold-on-gold rather than
// gold-as-accent.
//
// Tapping anywhere plays the real video using the exact same treatment
// the app already uses elsewhere (MovementVideoPlayer -- the
// youtube-nocookie embed with load-timeout retry and an always-visible
// reload button, Round 31) -- never a second, cover-specific player.
const GOLD_GRADIENT = {
  backgroundImage: `linear-gradient(135deg, ${colors.goldBright}, ${colors.gold})`,
} as object;

export function ChallengeVideoCover({ videoUrl, title }: Props) {
  const [playing, setPlaying] = useState(false);
  if (!videoUrl) return null;
  const youtubeId = extractYoutubeId(videoUrl);

  if (playing) {
    return (
      <View style={styles.playerWrap} testID="challenge-video-playing">
        <MovementVideoPlayer video={youtubeId ? { type: 'youtube', youtubeId } : null} />
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.cover, GOLD_GRADIENT]}
      onPress={() => setPlaying(true)}
      testID="challenge-video-cover"
      accessibilityLabel={`Watch Doc break down ${title}`}
    >
      <View style={styles.centerStack}>
        <Text style={styles.eyebrow}>THIS WEEK'S COW</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title.toUpperCase()}
        </Text>
        <View style={styles.playCircle}>
          <Ionicons name="play" size={24} color={colors.goldBright} />
        </View>
      </View>
      <View style={styles.tag}>
        <Text style={styles.tagText}>WATCH DOC BREAK IT DOWN</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    marginTop: 14,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playerWrap: {
    marginTop: 14,
    marginBottom: 14,
  },
  centerStack: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  eyebrow: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    color: colors.greenDeep,
    fontFamily: fonts.headline,
    fontSize: 32,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 14,
  },
  playCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: colors.greenDeep,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
});
