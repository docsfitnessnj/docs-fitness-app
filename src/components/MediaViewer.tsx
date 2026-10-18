import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  Image,
  NativeTouchEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppModal } from './AppModal';
import { AppPressable } from './AppPressable';
import { MediaAttachment } from '../lib/media';
import {
  canShareFilesOfType,
  downloadMediaDirectly,
  guessMimeType,
  prefetchMediaForSave,
  saveOrShareMediaNative,
  shareMediaFile,
} from '../lib/saveMedia';
import { browserCanDecodeHevc, detectVideoCodecFromUrl } from '../lib/videoCodec';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  media: MediaAttachment | null;
  onClose: () => void;
  // Base filename (no extension) offered to the share sheet / download.
  filenameHint?: string;
};

const MAX_SCALE = 4;
const DISMISS_THRESHOLD = 120;

type GestureMode = 'none' | 'pinch' | 'pan' | 'dismiss';

type GestureState = {
  mode: GestureMode;
  startDistance: number;
  startScale: number;
  startX: number;
  startY: number;
  startTranslate: { x: number; y: number };
};

const INITIAL_GESTURE: GestureState = {
  mode: 'none',
  startDistance: 0,
  startScale: 1,
  startX: 0,
  startY: 0,
  startTranslate: { x: 0, y: 0 },
};

function touchDistance(touches: NativeTouchEvent[]): number {
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

// Full-screen photo/video viewer shared by Messages (conversation media) and
// Community (post media): pinch-zoom + pan on photos, standard controls on
// video, swipe-down or the X to dismiss back to exactly where the caller
// was (this only ever overlays — it never navigates), and a save button.
// One unified touch handler decides pinch vs. pan vs. swipe-to-dismiss
// from the current zoom scale, rather than three competing gesture
// recognizers.
export function MediaViewer({ media, onClose, filenameHint = 'docs-fitness-media' }: Props) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const gesture = useRef<GestureState>(INITIAL_GESTURE);

  const reset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setDragY(0);
    gesture.current = INITIAL_GESTURE;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!media) return null;

  const onTouchStart = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2) {
      gesture.current = {
        ...gesture.current,
        mode: 'pinch',
        startDistance: touchDistance(touches),
        startScale: scale,
      };
    } else if (touches.length === 1) {
      if (scale > 1) {
        gesture.current = {
          ...gesture.current,
          mode: 'pan',
          startX: touches[0].pageX,
          startY: touches[0].pageY,
          startTranslate: translate,
        };
      } else {
        gesture.current = { ...gesture.current, mode: 'dismiss', startY: touches[0].pageY };
      }
    }
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    const g = gesture.current;
    if (g.mode === 'pinch' && touches.length === 2) {
      const nextScale = Math.min(MAX_SCALE, Math.max(1, g.startScale * (touchDistance(touches) / g.startDistance)));
      setScale(nextScale);
    } else if (g.mode === 'pan' && touches.length === 1) {
      setTranslate({
        x: g.startTranslate.x + (touches[0].pageX - g.startX),
        y: g.startTranslate.y + (touches[0].pageY - g.startY),
      });
    } else if (g.mode === 'dismiss' && touches.length === 1) {
      const dy = touches[0].pageY - g.startY;
      if (dy > 0) setDragY(dy);
    }
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    if (g.mode === 'dismiss' && dragY > DISMISS_THRESHOLD) {
      handleClose();
      return;
    }
    if (g.mode === 'dismiss') {
      setDragY(0);
    }
    if (scale <= 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
    gesture.current = { ...gesture.current, mode: 'none' };
  };

  const backdropOpacity = 1 - Math.min(dragY / (DISMISS_THRESHOLD * 2), 0.6);

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={[styles.container, { opacity: backdropOpacity }]}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        testID="media-viewer"
      >
        <View style={styles.topBar}>
          <AppPressable
            onPress={handleClose}
            hitSlop={10}
            style={styles.iconButton}
            pressedStyle={styles.iconButtonPressed}
            testID="media-viewer-close"
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </AppPressable>
          <SaveButton media={media} filenameHint={filenameHint} />
        </View>

        <View style={[styles.mediaWrap, { transform: [{ translateY: dragY }] }]}>
          {media.type === 'image' ? (
            <Image
              source={{ uri: media.uri }}
              style={[
                styles.image,
                { transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale }] },
              ]}
              resizeMode="contain"
            />
          ) : (
            <VideoPane uri={media.uri} posterUri={media.posterUri} />
          )}
        </View>
      </View>
    </AppModal>
  );
}

type SaveState = 'idle' | 'preparing' | 'ready' | 'saved';

// Bulletproof phone save, icon-only, no text in any state. navigator.share()
// must be invoked inside a fresh, direct user gesture with the file already
// in memory — no fetch in between, or Safari silently drops it. The same
// 40×40 circle carries every state instead of a labeled pill: a plain
// translucent circle with a spinner while bytes are still in flight, gold
// with the download arrow (plus a one-time pulse) the instant they land, and
// gold with a checkmark for a ~900ms flash right after a share or download —
// that gold-circle tap is the fresh gesture navigator.share() rides, with
// zero network wait left by the time it's tappable. Desktop (no
// file-sharing Web Share support) skips the prepare step entirely — see
// downloadMediaDirectly, a synchronous anchor-download — but still gets the
// same gold checkmark flash on success.
function SaveButton({ media, filenameHint }: { media: MediaAttachment; filenameHint: string }) {
  const [state, setState] = useState<SaveState>('idle');
  const blobRef = useRef<Blob | null>(null);
  const savedRevertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const wasReadyRef = useRef(false);

  const web = Platform.OS === 'web';
  const sharePath = web && canShareFilesOfType(guessMimeType(media));

  useEffect(() => {
    blobRef.current = null;
    wasReadyRef.current = false;
    if (savedRevertTimer.current) clearTimeout(savedRevertTimer.current);
    if (!sharePath) {
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('preparing');
    prefetchMediaForSave(media)
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        // Drops back to a plain, tappable icon rather than hanging in
        // "preparing" forever or popping an alert nobody asked for yet —
        // the next tap (handled below) retries and only then, if it fails
        // again, says so.
        setState('idle');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.uri, sharePath]);

  // Fires once, right as the icon turns gold-ready (never again while it
  // stays ready, never on the desktop download path, which has no
  // persistent "ready" state) -- a quiet nudge that bytes just landed and
  // the fresh tap Apple requires for navigator.share() is now live.
  useEffect(() => {
    if (state === 'ready' && !wasReadyRef.current) {
      wasReadyRef.current = true;
      pulseScale.setValue(1);
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.3, duration: 160, useNativeDriver: true }),
        Animated.spring(pulseScale, { toValue: 1, useNativeDriver: true }),
      ]).start();
    } else if (state === 'idle') {
      wasReadyRef.current = false;
    }
  }, [state, pulseScale]);

  const flashSaved = (revertTo: SaveState) => {
    setState('saved');
    savedRevertTimer.current = setTimeout(() => setState(revertTo), 900);
  };

  const onPress = async () => {
    if (!web) {
      await saveOrShareMediaNative(media);
      return;
    }

    if (!sharePath) {
      downloadMediaDirectly(media, filenameHint);
      flashSaved('idle');
      return;
    }

    if (state === 'preparing' || state === 'saved') return;

    if (state === 'idle') {
      // Either the first render hasn't caught up yet, or an earlier
      // prefetch failed -- either way, a tap here means "try now," and a
      // failure at THIS point (a deliberate, gesture-driven attempt) is
      // worth actually telling them about.
      setState('preparing');
      try {
        blobRef.current = await prefetchMediaForSave(media);
        setState('ready');
      } catch {
        setState('idle');
        showAlert('Couldn’t Download', "Couldn't download this file to save it. Check your connection and try again.");
      }
      return;
    }

    if (state === 'ready' && blobRef.current) {
      const result = await shareMediaFile(blobRef.current, media, filenameHint);
      if (result === 'shared') {
        flashSaved('ready');
      } else if (result === 'failed') {
        showAlert('Save Failed', "Your device closed the share sheet without saving. Try again.");
        setState('ready');
      } else {
        // Canceled -- the member changing their mind, not a failure.
        // Bytes are still cached and valid, so stay ready for another try.
        setState('ready');
      }
    }
  };

  useEffect(
    () => () => {
      if (savedRevertTimer.current) clearTimeout(savedRevertTimer.current);
    },
    []
  );

  // Gold treatment covers both success paths: the phone's persistent
  // "ready to share" state, and the one-shot "saved" flash shared by the
  // phone-share AND desktop-download taps alike -- same icon-only circle
  // throughout, never a pill, never a word.
  const isGoldReady = (sharePath && state === 'ready') || state === 'saved';
  const iconColor = isGoldReady ? colors.greenDeep : colors.white;

  return (
    <AppPressable
      onPress={onPress}
      hitSlop={10}
      style={isGoldReady ? styles.iconButtonGold : styles.iconButton}
      pressedStyle={isGoldReady ? styles.iconButtonGoldPressed : styles.iconButtonPressed}
      testID="media-viewer-save"
    >
      <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
        {sharePath && state === 'preparing' ? (
          <ActivityIndicator size="small" color={colors.white} testID="media-viewer-save-spinner" />
        ) : state === 'saved' ? (
          <Ionicons name="checkmark" size={22} color={iconColor} testID="media-viewer-save-check" />
        ) : (
          <Ionicons name="download-outline" size={22} color={iconColor} />
        )}
      </Animated.View>
    </AppPressable>
  );
}

// How long the video must sit in "playing, no painted frame yet" before
// this calls it undecodable rather than just still buffering — generous
// enough that a normal slow-network stall never trips it.
const UNDECODABLE_GRACE_MS = 3000;

// PART 1 — the HEVC black-video fallback. Chrome (most hardware) can
// demux an HEVC/H.265 .mp4 fine — duration, audio track, container
// metadata all check out — but can't decode the actual picture, so
// playback "succeeds": audio plays, the element reports real dimensions
// from the container's own track header, and no `error` event ever
// fires. The one honest signal left is whether a frame actually got
// painted. `requestVideoFrameCallback` answers that directly where it's
// supported (current Chromium/WebKit); elsewhere this falls back to
// sampling `videoWidth`/`videoHeight` after playback has demonstrably
// started (`currentTime > 0`) — a codec Chrome truly can't decode paints
// nothing, ever, so the element's own intrinsic size never resolves away
// from 0 either way that's checked.
function useUndecodableVideoDetector(videoEl: HTMLVideoElement | null, uri: string, skip: boolean) {
  const [cannotPlay, setCannotPlay] = useState(false);

  useEffect(() => {
    setCannotPlay(false);
    // `skip` means a codec-based verdict (videoCodec.ts) already answered
    // the question definitively, one way or the other -- a browser that
    // genuinely can decode this file should never have this timer armed
    // against it, no matter how slow the network is.
    if (Platform.OS !== 'web' || !videoEl || skip) return;
    let cancelled = false;
    let gotFrame = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const videoAny = videoEl as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };

    const armTimeout = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        const noDimensions = videoEl.videoWidth === 0 || videoEl.videoHeight === 0;
        if (!gotFrame && noDimensions) setCannotPlay(true);
      }, UNDECODABLE_GRACE_MS);
    };

    const onLoadedData = () => {
      if (cancelled) return;
      if (typeof videoAny.requestVideoFrameCallback === 'function') {
        videoAny.requestVideoFrameCallback(() => {
          gotFrame = true;
        });
      }
      armTimeout();
    };
    const onError = () => {
      if (!cancelled) setCannotPlay(true);
    };

    videoEl.addEventListener('loadeddata', onLoadedData, { once: true });
    videoEl.addEventListener('error', onError);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      videoEl.removeEventListener('loadeddata', onLoadedData);
      videoEl.removeEventListener('error', onError);
    };
  }, [videoEl, uri, skip]);

  return cannotPlay;
}

type CodecVerdict = 'checking' | 'known-ok' | 'known-undecodable' | 'unknown';

function VideoPane({ uri, posterUri }: { uri: string; posterUri?: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  const viewRef = useRef<{ nativeRef?: React.RefObject<HTMLVideoElement> } | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [codecVerdict, setCodecVerdict] = useState<CodecVerdict>('checking');

  // PART 3 — asks the file's own container what codec it actually carries
  // (videoCodec.ts, via a couple of small HTTP Range reads against the
  // Supabase object URL -- no download, no server/database change) rather
  // than trusting that narrowing the picker's accept list forced a
  // transcode. HEVC is fine on a browser with hardware HEVC decode (iPhone/
  // iPad Safari) and genuinely undecodable on most desktop Chrome/Firefox --
  // `browserCanDecodeHevc()` is what tells those two apart. A verdict here
  // short-circuits the frame-painted heuristic below entirely, so a phone
  // that can actually decode the file is never at risk of the heuristic's
  // own timer misfiring the "cannot play" banner on it.
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
        else if (codec === 'h264') setCodecVerdict('known-ok');
        else setCodecVerdict('unknown');
      })
      .catch(() => {
        if (!cancelled) setCodecVerdict('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  // Still armed as a safety net while the codec check is in flight or ends
  // up inconclusive -- catches a genuinely undecodable file even if the
  // container couldn't be parsed -- but never armed once the codec check
  // has a definitive answer either way.
  const skipHeuristic = codecVerdict === 'known-ok' || codecVerdict === 'known-undecodable';
  const heuristicCannotPlay = useUndecodableVideoDetector(videoEl, uri, skipHeuristic);
  const cannotPlay = codecVerdict === 'known-undecodable' || (!skipHeuristic && heuristicCannotPlay);

  useEffect(() => {
    // The underlying <video> DOM node is attached by the time this effect
    // runs (refs commit before effects) — grabbed once per uri so the
    // detector effect above has something to attach its own listeners to.
    const el = viewRef.current?.nativeRef?.current ?? null;
    setVideoEl(el);
    // expo-video's web VideoView doesn't expose a `preload` prop, so this
    // sets it directly on the real element — belt-and-suspenders beside
    // the browser's own ~metadata-ish default when the attribute is
    // unset. The explicit play() call right below naturally starts
    // streaming real data past just metadata once the viewer is actually
    // open (that's the point of opening it), the same way it would with
    // any video player; this only matters for not preloading data before
    // that point. The poster is set the same way -- the browser's own
    // native `poster` attribute, which shows until real decoded data
    // arrives and then steps aside with zero extra DOM elements, rather
    // than a separate absolutely-positioned <Image> sibling that would sit
    // in its own stacking context ABOVE this static-positioned <video> and
    // silently swallow every tap meant for the native play/pause controls.
    if (el) {
      el.preload = 'metadata';
      if (posterUri) el.poster = posterUri;
    }
  }, [uri, posterUri]);

  return (
    <View style={styles.videoBox}>
      <VideoView
        ref={viewRef as never}
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        playsInline
        testID="media-viewer-video"
      />
      {cannotPlay && (
        <View style={styles.undecodableBanner} testID="media-viewer-undecodable" pointerEvents="none">
          <Text style={styles.undecodableText}>
            This video cannot play in this browser. It will still play on your phone.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(10,15,13,0.97)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 56,
    zIndex: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  iconButtonGold: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonGoldPressed: {
    backgroundColor: colors.goldDeep,
  },
  mediaWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  videoBox: {
    width: '100%',
    height: '70%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  undecodableBanner: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '50%',
    transform: [{ translateY: -30 }],
    alignItems: 'center',
  },
  undecodableText: {
    color: colors.white,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    backgroundColor: 'rgba(5,76,61,0.75)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
