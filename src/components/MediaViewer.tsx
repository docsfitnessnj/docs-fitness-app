import React, { useRef, useState } from 'react';
import { GestureResponderEvent, Image, NativeTouchEvent, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppModal } from './AppModal';
import { MediaAttachment } from '../lib/media';
import { saveOrShareMedia } from '../lib/saveMedia';
import { colors } from '../theme';

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
// was (this only ever overlays — it never navigates), and a save/share
// button. One unified touch handler decides pinch vs. pan vs.
// swipe-to-dismiss from the current zoom scale, rather than three
// competing gesture recognizers.
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
          <Pressable onPress={handleClose} hitSlop={10} style={styles.iconButton} testID="media-viewer-close">
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          <Pressable
            onPress={() => saveOrShareMedia(media, filenameHint)}
            hitSlop={10}
            style={styles.iconButton}
            testID="media-viewer-save"
          >
            <Ionicons name="share-outline" size={22} color={colors.white} />
          </Pressable>
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
            <VideoPane uri={media.uri} />
          )}
        </View>
      </View>
    </AppModal>
  );
}

function VideoPane({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" testID="media-viewer-video" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(10,15,13,0.97)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  mediaWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '70%',
  },
});
