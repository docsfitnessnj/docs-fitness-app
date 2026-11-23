import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppModal } from './AppModal';
import { StoryItem, useStories } from '../context/StoriesContext';
import { browserCanDecodeHevc, detectVideoCodecFromUrl } from '../lib/videoCodec';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

// Round 67 PART 5.1: a photo segment displays for 20 seconds, up from
// Round 66's original 5 -- an owner decision, final. Also the fallback
// advance timer for a video this browser genuinely can't decode at all
// (see VideoSegment's own codecVerdict effect below), for the same
// consistency reason Round 66 picked a single shared constant in the
// first place.
const ITEM_DURATION_MS = 20000;
const SWIPE_DOWN_CLOSE_THRESHOLD = 80;

type CodecVerdict = 'checking' | 'known-ok' | 'known-undecodable';

// Round 66: a real video story, in the same inline-fullscreen treatment
// expo-video already gives every other video in this app (MediaViewer's
// pattern) -- but driving THIS viewer's own progress bar and auto-advance
// off the real video's own playback (timeUpdate/playToEnd), not the fixed
// ITEM_DURATION_MS timer an image segment still uses below. Confirmed
// directly (not assumed) against a real H.264 fixture and a real
// HEVC-encoded one: H.264 decodes and plays, sound included, in this
// sandbox's own headless Chromium; an HEVC file reaches readyState 4 and
// its audio track genuinely plays, but videoWidth/videoHeight never leave
// 0 -- the identical silent "plays the audio, never paints a frame"
// failure MediaViewer.tsx's own HEVC fallback already exists for, now
// independently confirmed for Stories. codecVerdict reuses that exact
// mechanism (detectVideoCodecFromUrl + browserCanDecodeHevc) so a member
// on a browser that genuinely can't decode HEVC sees the same honest
// banner instead of a frozen black frame -- and falls back to the fixed
// timer for its own auto-advance, since playToEnd's own timing can't be
// trusted as the story's pacing once the video track itself never
// resolves. In practice this almost never fires: the web admin posting
// flow's own picker (useMediaPicker.ts's WEB_ACCEPT) already forces an
// iPhone's HEVC .mov to transcode to H.264 before it's ever picked, so a
// story posted from the real web admin flow is H.264 by construction.
function VideoSegment({
  uri,
  progressAnim,
  onEnd,
}: {
  uri: string;
  progressAnim: Animated.Value;
  onEnd: () => void;
}) {
  // `useVideoPlayer`'s own setup callback runs synchronously inside
  // useMemo, during render -- strictly BEFORE VideoView's own child
  // useEffect has mounted the real <video> element (confirmed directly
  // by reading expo-video's web source: VideoPlayerWeb.play() only ever
  // iterates its own _mountedVideos set, and mountVideoView() is called
  // from VideoView's own effect, not during setup). Calling play() there
  // is a silent no-op on web -- it iterates zero mounted videos. `muted`
  // is unaffected by this (mountVideoView() copies _muted onto the video
  // at mount time regardless of when it was set), which is exactly why
  // this bug reads as "decodes fine, correctly unmuted, but never
  // actually plays" rather than failing outright. play() is called below
  // instead, in VideoSegment's OWN effect -- which, as this component's
  // own child, runs after VideoView's child effect has already mounted
  // the real element, since React fires child effects before parent ones.
  const player = useVideoPlayer(uri, (p) => {
    p.muted = false;
  });
  const [codecVerdict, setCodecVerdict] = useState<CodecVerdict>('checking');

  useEffect(() => {
    setCodecVerdict('checking');
    if (Platform.OS !== 'web') {
      setCodecVerdict('known-ok');
      return;
    }
    let cancelled = false;
    detectVideoCodecFromUrl(uri)
      .then((codec) => {
        if (cancelled) return;
        if (codec === 'hevc') setCodecVerdict(browserCanDecodeHevc() ? 'known-ok' : 'known-undecodable');
        else setCodecVerdict('known-ok');
      })
      .catch(() => {
        if (!cancelled) setCodecVerdict('known-ok');
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  useEffect(() => {
    progressAnim.setValue(0);
    player.play();
    const endSub = player.addListener('playToEnd', onEnd);
    const timeSub = player.addListener('timeUpdate', ({ currentTime }: { currentTime: number }) => {
      const duration = player.duration;
      if (duration > 0) progressAnim.setValue(Math.min(1, currentTime / duration));
    });
    return () => {
      endSub.remove();
      timeSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // A genuinely undecodable video never reaches playToEnd in a way this
  // story's own pacing can rely on -- falls back to the same fixed timer
  // an image segment uses, so the viewer still advances instead of
  // sitting on a frozen frame forever.
  useEffect(() => {
    if (codecVerdict !== 'known-undecodable') return;
    progressAnim.setValue(0);
    const animation = Animated.timing(progressAnim, {
      toValue: 1,
      duration: ITEM_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) onEnd();
    });
    return () => animation.stop();
  }, [codecVerdict, progressAnim, onEnd]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* PART 3: already contentFit="contain" since Round 66 -- confirmed
          directly rather than assumed before touching anything; only the
          photo segment above needed the fix from "cover" to "contain". */}
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="contain" testID="story-video" />
      {codecVerdict === 'known-undecodable' && (
        <View style={styles.undecodableBanner} testID="story-undecodable" pointerEvents="none">
          <Text style={styles.undecodableText}>This video cannot play in this browser. It will still play on your phone.</Text>
        </View>
      )}
    </View>
  );
}

type Props = {
  stories: StoryItem[];
  startIndex: number;
  onClose: () => void;
  // PART 4: gates the quiet DELETE control below -- members never see it.
  // The real enforcement is server-side (migration_036.sql's own RLS
  // delete policy); this is purely the UI gate.
  isAdmin?: boolean;
};

export function StoryViewer({ stories, startIndex, onClose, isAdmin = false }: Props) {
  const { markViewed, deleteStory } = useStories();
  const [index, setIndex] = useState(startIndex);
  const progressAnims = useRef(stories.map(() => new Animated.Value(0))).current;
  const dragY = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    setIndex((prev) => {
      if (prev >= stories.length - 1) {
        onClose();
        return prev;
      }
      return prev + 1;
    });
  };

  const goBack = () => {
    setIndex((prev) => Math.max(0, prev - 1));
  };

  // PART 4: the owner's own "posted by mistake" escape hatch. Deletes the
  // real row (and, best-effort, the underlying Storage object) server
  // side -- never a local-only hide, since every other open member session
  // needs to lose it too (the existing realtime subscription in
  // StoriesContext already handles that half for free). `remainingCount`
  // is computed off THIS closure's own `stories` prop (which still
  // includes the one just deleted) rather than re-reading context state
  // right after the await, since React hasn't re-rendered this component
  // with the parent's new, shrunk array yet at that exact point -- this
  // avoids a stale-read race entirely rather than working around one.
  const handleDeleteCurrent = async () => {
    const target = stories[index];
    if (!target) return;
    const ok = await deleteStory(target.id);
    if (!ok) {
      showAlert("Couldn't Delete Story", 'Something went wrong. Try again.');
      return;
    }
    const remainingCount = stories.length - 1;
    if (remainingCount <= 0) {
      onClose();
    } else if (index >= remainingCount) {
      setIndex(remainingCount - 1);
    }
    // else: index stays put -- the next render (once the parent passes the
    // real, now-shorter stories array) shows what was the next segment,
    // the same "delete this one, advance to the next" shape Instagram's
    // own stories use.
  };

  const confirmDeleteCurrent = () => {
    showAlert('Delete This Story?', "This can't be undone.", [
      { text: 'Keep Story', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: handleDeleteCurrent },
    ]);
  };

  useEffect(() => {
    const current = stories[index];
    if (!current) return;
    markViewed(current.id);

    progressAnims.forEach((anim, i) => {
      if (i < index) anim.setValue(1);
      else if (i > index) anim.setValue(0);
    });

    progressAnims[index].setValue(0);

    // A video segment drives its own progress/auto-advance off the real
    // playback (VideoSegment, above) -- nothing to start here for it.
    if (current.mediaType === 'video') return;

    const animation = Animated.timing(progressAnims[index], {
      toValue: 1,
      duration: ITEM_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) goNext();
    });

    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > SWIPE_DOWN_CLOSE_THRESHOLD) {
          onClose();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const current = stories[index];
  if (!current) return null;

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        style={[styles.container, { transform: [{ translateY: dragY }] }]}
        nativeID="story-viewer-safe-top"
        {...panResponder.panHandlers}
      >
        <View style={styles.progressRow}>
          {stories.map((story, i) => (
            <View key={story.id} style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.headerRow}>
          {/* A same-sized invisible stand-in for the close button, matching
              AppTopBar's own placeholder pattern -- keeps "DOC" visually
              centered now that the left side has no back control (the left
              tap zone already handles "previous", so a dedicated BACK
              button was redundant -- see AGENTS.md). PART 4: admin gets a
              real, quiet DELETE control in this same slot instead of the
              plain spacer -- members never see it. */}
          {isAdmin ? (
            <Pressable onPress={confirmDeleteCurrent} hitSlop={10} style={styles.closeButtonSlot} testID="story-delete">
              <Ionicons name="trash-outline" size={20} color={colors.white} />
            </Pressable>
          ) : (
            <View style={styles.closeButtonSlot} />
          )}
          <Text style={styles.headerText}>DOC</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeButtonSlot} testID="story-close">
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.mediaArea}>
          {current.mediaType === 'video' ? (
            <VideoSegment key={current.id} uri={current.mediaUri} progressAnim={progressAnims[index]} onEnd={goNext} />
          ) : (
            // PART 3: the same house rule as the About page's own crew photo
            // -- media renders at its natural aspect ratio, never cropped to
            // fill. "contain" fits the whole image on screen, letterboxed on
            // the viewer's own black background (container's backgroundColor
            // below) when the ratios differ, instead of the old "cover"
            // crop, which is what zoomed and cropped the owner's real
            // posted 1080x1350 portrait photo.
            <Image source={{ uri: current.mediaUri }} style={StyleSheet.absoluteFill} resizeMode="contain" testID="story-photo" />
          )}
        </View>

        <View style={styles.tapZones} pointerEvents="box-none">
          <Pressable style={styles.tapZoneLeft} onPress={goBack} testID="story-tap-left" />
          <Pressable style={styles.tapZoneRight} onPress={goNext} testID="story-tap-right" />
        </View>
      </Animated.View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  // paddingTop here is the ordinary-browser-chrome value; index.html's
  // #story-viewer-safe-top rule adds the real env(safe-area-inset-top) on
  // top of it in standalone mode -- a single additive source, not a
  // separate SafeAreaTopFill stacked alongside it. See AGENTS.md.
  container: {
    flex: 1,
    paddingTop: 50,
    backgroundColor: '#000000',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.white,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
    // Guarantees the close button (and anything else in this row) wins
    // hit-testing over tapZones below, regardless of whether their boxes
    // spatially overlap -- tapZones' own `top` is a flat value that
    // doesn't account for a real safe-area inset pushing this row lower,
    // so on an installed standalone iPhone the two COULD genuinely
    // overlap. This was the real mechanism behind a real-device bug
    // report ("the X doesn't respond to taps, but the left/right tap
    // zones do") -- tapZoneLeft/Right are large, pointerEvents:'auto'
    // Pressables that, without this, paint on top of this row simply by
    // being later in the DOM. See AGENTS.md.
    zIndex: 10,
  },
  headerText: {
    flex: 1,
    textAlign: 'center',
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
  },
  // Also the close button's own box -- at least 44x44, the minimum
  // comfortable touch target, not just hitSlop padding around a much
  // smaller icon. Reused unstyled (no Pressable) as the left-side
  // placeholder that keeps "DOC" visually centered.
  closeButtonSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaArea: {
    flex: 1,
  },
  undecodableBanner: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '50%',
    transform: [{ translateY: -20 }],
    alignItems: 'center',
  },
  undecodableText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  tapZones: {
    position: 'absolute',
    top: 90,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tapZoneLeft: {
    flex: 35,
  },
  tapZoneRight: {
    flex: 65,
  },
});
