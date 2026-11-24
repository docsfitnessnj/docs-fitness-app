import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppModal } from './AppModal';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';
import { StoryItem, useStories } from '../context/StoriesContext';
import { browserCanDecodeHevc, detectVideoCodecFromUrl } from '../lib/videoCodec';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

// Round 68 FINDING 2: a real device showed a video story mount tiny, in
// the top-left corner, before snapping to its correct full letterboxed
// size a moment later. The real, confirmed root cause is a plain CSS
// fact about REPLACED elements (<video>/<img>), not a timing quirk: per
// CSS 2.1 10.3.8 (absolutely positioned, replaced elements), when a
// replaced element's own width/height are left `auto`, `inset: 0` alone
// does NOT stretch it edge-to-edge the way it would a plain <div> --
// width/height instead resolve to the element's own INTRINSIC size (the
// real decoded video's own pixel dimensions once known, or the browser's
// 300x150 UA fallback box before that), anchored top-left. Confirmed two
// ways before trusting it: an isolated test page (position:absolute;
// inset:0 alone vs. the same plus explicit width:100%/height:100%)
// reproduced exactly this split -- 300x150 pinned at the container's own
// top-left without the explicit size, the full container with it -- and a
// real screenshot of this component's own pre-fix markup, caught only by
// actually looking at the rendered pixels (not just reading computed
// `position`/`inset` strings, which read correctly either way and are
// what the first pass of this investigation checked), showed the live
// story video sitting exactly top-left at its own small intrinsic size.
// MediaViewer.tsx's own <VideoView> already carries `width: '100%', height:
// '100%'` in its own styles.video -- confirmed directly, this component
// was the one place in the app that omitted it, the same shape as the
// missing playsInline below. The fix (VideoSegment's own style array)
// adds that explicit sizing so the box itself is ALWAYS correctly sized
// regardless of the video's own intrinsic dimensions -- independent of,
// and layered with, the hide-until-first-frame treatment just below,
// which still matters for a second, narrower reason: object-fit's own
// positioning of the DECODED FRAME CONTENT inside that now-always-correct
// box still needs a known aspect ratio, so the video stays invisible
// until a real first frame confirms one, rather than ever showing a
// blank/mis-fit frame inside an already-correctly-sized box. This many
// milliseconds is a safety net only, not the expected path --
// onFirstFrameRender (below) almost always fires well under it.
const FRAME_READY_FALLBACK_MS = 6000;

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
  //
  // Round 68 FINDING 3: timeUpdateEventInterval defaults to 0 on web
  // (confirmed directly by reading VideoPlayer.web.tsx's own source) --
  // expo-video's own timeUpdate event is NEVER emitted unless this is
  // explicitly set to a positive number of seconds. Without it, the
  // progress bar below stayed frozen at 0% for the real video's ENTIRE
  // runtime regardless of how playback was actually going underneath it --
  // exactly the "stalls and never finishes" symptom a real device
  // reported, even on a video that may well have been playing (or had
  // already ended) just fine.
  const player = useVideoPlayer(uri, (p) => {
    p.muted = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const [codecVerdict, setCodecVerdict] = useState<CodecVerdict>('checking');
  // Round 68 FINDING 2: see the module-level comment on FRAME_READY_FALLBACK_MS
  // above -- the video stays invisible (the viewer's own black background
  // shows through) until the browser has genuinely decoded a real first
  // frame, which is also the exact moment its intrinsic size is finally
  // known, so there is never a window where a wrong-sized box can paint.
  const [frameReady, setFrameReady] = useState(false);
  // Round 68 FINDING 3: a quiet buffering treatment, driven by the real
  // player's own statusChange event -- 'loading' is exactly what a real
  // network stall mid-playback sets (VideoPlayerWeb's own onwaiting
  // handler), 'readyToPlay' is what clears it once enough data is
  // buffered again. Gated on frameReady below so the ordinary, expected
  // buffering every video does before its very first frame never shows
  // this banner -- only a stall AFTER playback has genuinely started.
  const [buffering, setBuffering] = useState(false);

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
    const statusSub = player.addListener('statusChange', ({ status }: { status: string }) => {
      setBuffering(status === 'loading');
    });
    return () => {
      endSub.remove();
      timeSub.remove();
      statusSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Round 68 FINDING 2: a safety net only -- onFirstFrameRender (the real,
  // typed expo-video hook bound to the native loadeddata event) almost
  // always fires well inside this window. If it genuinely never does (a
  // dropped connection, a file that fails to decode at all), this still
  // reveals whatever's there rather than leaving the viewer on a
  // permanently hidden black frame with no way to tell anything is wrong.
  useEffect(() => {
    if (frameReady) return;
    const timer = setTimeout(() => setFrameReady(true), FRAME_READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [frameReady, uri]);

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
          photo segment above needed the fix from "cover" to "contain".
          Round 68 FINDING 4: playsInline is the owner decision's own real
          fix -- confirmed by direct comparison against MediaViewer.tsx
          (which already sets it, with its own documented reasoning) that
          this component alone omitted it. Without it, iOS Safari hands a
          playing <video> off to the OS's own native fullscreen player,
          entirely independent of this app's nativeControls={false} --
          which brings along Apple's own skip-back/skip-forward-10 controls,
          exactly the ones the owner found halting playback. nativeControls
          stays false and fullscreenOptions stays unset (so expo-video's
          own default controlsList="nofullscreen" still applies) -- the
          story viewer's only interactions remain the existing tap
          zones/close/admin-delete, never a scrub or skip control of any
          kind. */}
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, styles.videoStretch, !frameReady && styles.hiddenUntilReady]}
        nativeControls={false}
        contentFit="contain"
        playsInline
        onFirstFrameRender={() => setFrameReady(true)}
        testID="story-video"
      />
      {frameReady && buffering && codecVerdict !== 'known-undecodable' && (
        <View style={styles.bufferingOverlay} testID="story-buffering" pointerEvents="none">
          <ActivityIndicator color={colors.white} size="small" />
        </View>
      )}
      {codecVerdict === 'known-undecodable' && (
        <View style={styles.undecodableBanner} testID="story-undecodable" pointerEvents="none">
          <Text style={styles.undecodableText}>This video cannot play in this browser. It will still play on your phone.</Text>
        </View>
      )}
    </View>
  );
}

// Round 68 FINDING 1: a real device took the WHOLE APP down to the error
// boundary during the owner's own first video post, then worked on retry --
// an exhaustive, direct read of every file in the real posting flow found
// nothing that could throw synchronously during React's render/commit/
// effect work (every async step is already wrapped in try/catch, surfacing
// as the existing Couldn't Post Story alert -- a thrown promise rejection,
// which a React error boundary can never catch at all, regardless of the
// cause), and a targeted repro of the single most plausible real scenario
// (admin's own first story of the day, posted as a video, with the ADD
// badge's own JSX swapping mid-upload the instant the real row lands)
// didn't reproduce a crash in this sandbox's own headless Chromium either.
// The real, new, genuinely complex code is the media playback just below,
// not the posting flow -- this boundary (see its own comment at the real
// call site) is the mechanical guarantee that whatever the owner's device
// actually hit, it can never take the app shell down again. This hook lets
// the suite prove that guarantee directly, by forcing the exact kind of
// unanticipated render-phase throw no amount of reading can rule out for
// certain, rather than only asserting the absence of a bug this
// investigation couldn't reproduce. Real app code never reads or sets this
// global -- the same "force what the real mechanism would produce"
// convention this app's own test suite already uses throughout
// (window.__tourTestForceMissing, window.__shareCardForceColorwayIndex).
declare global {
  // eslint-disable-next-line no-var
  var __storyMediaTestForceCrash: boolean | undefined;
}
function StoryMediaCrashTestHook() {
  if (typeof window !== 'undefined' && window.__storyMediaTestForceCrash) {
    throw new Error('forced test crash (window.__storyMediaTestForceCrash)');
  }
  return null;
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
          {/* Round 68 FINDING 1: an exhaustive, direct read of every file in
              the real posting flow (StoriesContext.postStory, the media
              picker, the duration/codec/size checks, the progress ring)
              found every async step already wrapped in try/catch, with
              nothing that can throw synchronously during render -- a
              genuine unhandled exception there would surface as a
              rejected promise, never a React render-phase throw an error
              boundary can catch, and none was reproducible in this
              sandbox's own headless Chromium even against the real
              scenario most likely to trigger it (the admin's own
              genuinely first story of the day, posted as a video, with
              the ADD badge's own JSX swapping mid-upload the instant the
              real row lands). The real media playback below -- new,
              genuinely complex, device-specific code -- is the far more
              plausible site for whatever the owner's own real device hit.
              This boundary is the same backstop ScreenErrorBoundary.tsx's
              own comment already documents for DOC'S GROUP CHAT: it
              doesn't replace fixing a known bug, it's what keeps the next
              unanticipated one from being able to take the WHOLE APP down
              -- scoped to just this media area (not the whole viewer), so
              the close button and tap zones above/below stay fully
              reachable even if the media itself crashes. */}
          <ScreenErrorBoundary label="DOC'S STORIES">
            <StoryMediaCrashTestHook />
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
          </ScreenErrorBoundary>
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
  // Round 68 FINDING 2 -- the real fix: a replaced element (<video>) with
  // only position:absolute + inset:0 (StyleSheet.absoluteFill) does NOT
  // stretch to fill its container the way a plain View does -- per CSS
  // 2.1 10.3.8, its own auto width/height resolve to its INTRINSIC size
  // instead, anchored top-left. Explicit width/height:'100%' (the same
  // pairing MediaViewer.tsx's own styles.video already uses) is what
  // actually forces the box itself to fill mediaArea, independent of
  // whatever the video's own real pixel dimensions turn out to be.
  videoStretch: {
    width: '100%',
    height: '100%',
  },
  // Round 68 FINDING 2 -- opacity, not display:none or a conditional
  // unmount: the real <video> element stays mounted and decoding the whole
  // time, it just isn't painted yet. Unmounting it instead would cancel
  // and restart the real network request/decode every time frameReady
  // flips, which is exactly the kind of self-inflicted stall Finding 3
  // already has enough real causes to fix without adding a new one here.
  hiddenUntilReady: {
    opacity: 0,
  },
  // Round 68 FINDING 3 -- centered over the video, pointerEvents:'none' so
  // it can never itself become a tappable surface (this app's own standing
  // "fills are paint, not controls" rule, AGENTS.md).
  bufferingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
