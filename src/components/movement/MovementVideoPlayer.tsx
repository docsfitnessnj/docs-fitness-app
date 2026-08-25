import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MovementVideoSource } from '../../data/movements';
import { colors, fonts } from '../../theme';

type Props = {
  video: MovementVideoSource | null;
};

function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
}

function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

// YouTube for now, everywhere it's asked to play. Web renders a real inline
// iframe (react-native-web allows raw DOM tags via createElement). Native
// has no WebView dependency wired up yet, so it opens the video in the
// YouTube app/browser instead of embedding it — swapping either path to a
// self-hosted player later is a change inside this one component, since
// every caller just hands it a MovementVideoSource.
export function MovementVideoPlayer({ video }: Props) {
  if (!video) {
    return (
      <View style={styles.placeholder} testID="movement-video-placeholder">
        <View style={styles.playCircle}>
          <Ionicons name="videocam-outline" size={22} color={colors.white} />
        </View>
        <Text style={styles.placeholderText}>Video coming soon</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.playerWrap} testID="movement-video-player">
        {React.createElement('iframe', {
          src: youtubeEmbedUrl(video.youtubeId),
          style: { width: '100%', height: '100%', border: 0 },
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowFullScreen: true,
        })}
      </View>
    );
  }

  return (
    <Pressable
      style={styles.placeholder}
      onPress={() => Linking.openURL(youtubeWatchUrl(video.youtubeId))}
      testID="movement-video-player"
    >
      <View style={styles.playCircle}>
        <Ionicons name="play" size={22} color={colors.white} />
      </View>
      <Text style={styles.placeholderText}>Watch on YouTube</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  playerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  placeholderText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
