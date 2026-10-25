import React, { useEffect, useRef, useState } from 'react';
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

// How long to wait for the iframe's own `load` event before assuming the
// embed request itself is hung (blocked, offline, a slow connection) and
// forcing a fresh attempt. A genuine network-level failure (no response at
// all) fires no DOM signal of any kind on a cross-origin iframe -- not even
// an error event -- so a timeout is the only generic way to detect it.
const LOAD_TIMEOUT_MS = 7000;
// After this many automatic attempts with no load signal, stop retrying on
// a timer and show an actionable "couldn't load" card instead of silently
// retrying forever.
const MAX_AUTO_RETRIES = 2;

// Round 31: a real-device report found every Movement Vault video
// rendering as a solid black box -- the exact color `playerWrap`'s own
// background paints when nothing inside it ever renders. Two real failure
// modes can produce this, and neither leaves a reliable same-origin signal
// behind: the embed request can simply hang (blocked/offline/slow — the
// iframe's own `load` event never fires at all), or the outer embed
// document can load fine (`load` DOES fire) while the player itself
// (YouTube's own further-nested iframes, entirely opaque to this page)
// never paints a frame, for reasons as ordinary as an ad blocker or a slow
// CDN on that specific load. Reproduced directly (cold start and warm
// start, as both a limited-access and a full-access account) that nothing
// about this app's own Round 29/30 overlay or modal-gating changes
// interferes with this component's own render or mount lifecycle -- the
// black box is the YouTube embed itself failing silently, not an access
// gate (this video has never had one, and still doesn't).
function WebVideoEmbed({ youtubeId }: { youtubeId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exhausted) return;
    timeoutRef.current = setTimeout(() => {
      setAttempt((a) => {
        const next = a + 1;
        if (next > MAX_AUTO_RETRIES) setExhausted(true);
        return next;
      });
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, youtubeId, exhausted]);

  const retryNow = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setExhausted(false);
    setAttempt((a) => a + 1);
  };

  if (exhausted) {
    return (
      <Pressable style={styles.placeholder} onPress={retryNow} testID="movement-video-retry">
        <View style={styles.playCircle}>
          <Ionicons name="refresh" size={22} color={colors.white} />
        </View>
        <Text style={styles.placeholderText}>Couldn't load video. Tap to retry.</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.playerWrap} testID="movement-video-player">
      {React.createElement('iframe', {
        // Changing `key` forces React to tear down and mount a brand new
        // iframe element -- a genuinely new browsing context, so this is a
        // real fresh request every retry, never served from whatever state
        // the previous failed attempt left behind.
        key: attempt,
        src: youtubeEmbedUrl(youtubeId),
        style: { width: '100%', height: '100%', border: 0 },
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        allowFullScreen: true,
        onLoad: () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
        },
      })}
      {/* Always available, not just after a detected failure -- the
          "outer document loaded fine but the player itself never painted"
          failure mode leaves no JS-visible signal to react to at all, so
          this is the member's own way to recover from it rather than
          waiting on a timeout that will never fire. */}
      <Pressable
        style={styles.reloadButton}
        onPress={retryNow}
        hitSlop={8}
        testID="movement-video-reload"
        accessibilityLabel="Reload video"
      >
        <Ionicons name="refresh" size={16} color={colors.white} />
      </Pressable>
    </View>
  );
}

// YouTube for now, everywhere it's asked to play. Web renders a real inline
// iframe (react-native-web allows raw DOM tags via createElement). Native
// has no WebView dependency wired up yet, so it opens the video in the
// YouTube app/browser instead of embedding it — swapping either path to a
// self-hosted player later is a change inside this one component, since
// every caller just hands it a MovementVideoSource.
//
// Owner decision, final (Round 31): this video is visible and playable for
// EVERY tier that can reach a movement detail screen at all -- no overlay,
// no lock, no tier check here, ever. This component takes no membership
// prop and never will.
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
    return <WebVideoEmbed youtubeId={video.youtubeId} />;
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
  reloadButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
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
