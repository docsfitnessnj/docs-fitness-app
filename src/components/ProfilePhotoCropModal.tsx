import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { AppModal } from './AppModal';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

// react-native-web passes these CSS touch/outline properties straight
// through, but core RN's style types don't declare them — cast once here
// rather than fight the excess-property check on every style object that
// needs one. `touchAction: 'none'` stops the browser's own pan/zoom/scroll
// gesture handling from ever engaging inside the crop frame, so a pinch or
// drag is entirely ours to interpret (no competing native scroll/bounce).
const NO_TOUCH_ACTION = { touchAction: 'none' } as object;

const FRAME_SIZE = 240;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
// The saved avatar's own pixel size — plenty for every place it renders
// (profile, posts, comments), while keeping the uploaded file small.
const OUTPUT_SIZE = 512;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

type NaturalSize = { width: number; height: number };

type Props = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
};

// A circular crop/zoom/pan step shown before a picked photo is saved as the
// profile picture — the OS picker's own crop UI isn't available on web, so
// this in-app frame stands in on every platform. The frame is a circle
// because that's exactly how Avatar renders everywhere else in the app
// (profile, posts, comments) — what's framed here is what shows there.
//
// The photo is rendered at its real "cover" size for the frame (at least as
// big as the frame on both axes, preserving its own aspect ratio) and
// panned/zoomed via a translate + scale transform, so a one-finger drag or
// two-finger pinch directly repositions/rescales the source photo under a
// fixed frame — not a cosmetic preview: USE PHOTO actually crops the source
// image to exactly the framed region via expo-image-manipulator, so what's
// framed here is pixel-for-pixel what gets saved.
export function ProfilePhotoCropModal({ visible, uri, onCancel, onConfirm }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const [saving, setSaving] = useState(false);

  const gestureRef = useRef({
    touchCount: 0,
    startZoom: 1,
    startPan: { x: 0, y: 0 },
    startDistance: 0,
    startTouch: { x: 0, y: 0 },
    // The pinch's own midpoint, in "distance from frame center" units —
    // captured once when a 2-finger gesture (re)starts, so the zoom can
    // stay anchored under the fingers instead of the frame's center for
    // the whole gesture.
    pinchCenter: { x: 0, y: 0 },
  });
  const frameRef = useRef<View>(null);
  const frameOriginRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!visible || !uri) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNaturalSize(null);
    Image.getSize(
      uri,
      (width, height) => setNaturalSize({ width, height }),
      () => setNaturalSize({ width: FRAME_SIZE, height: FRAME_SIZE })
    );
  }, [visible, uri]);

  // Measures the frame's on-screen position once the dialog has laid out,
  // so a pinch's screen-space finger midpoint can be converted into a
  // position relative to the frame (and from there, relative to the
  // photo) — the dialog itself never scrolls once open, so one measurement
  // per open is enough.
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      frameRef.current?.measureInWindow((x, y) => {
        frameOriginRef.current = { x, y };
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // Locks the page behind the dialog still while it's open on web — without
  // this, a two-finger pinch that starts on the crop frame can still bubble
  // into the browser's own scroll/bounce/zoom handling on the page behind
  // it, which is exactly the "whole screen shaking" this is fixing.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousTouchAction = body.style.touchAction;
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    return () => {
      body.style.overflow = previousOverflow;
      body.style.touchAction = previousTouchAction;
    };
  }, [visible]);

  const scaleCover = naturalSize ? Math.max(FRAME_SIZE / naturalSize.width, FRAME_SIZE / naturalSize.height) : 1;
  const dispWidth = naturalSize ? naturalSize.width * scaleCover * zoom : FRAME_SIZE;
  const dispHeight = naturalSize ? naturalSize.height * scaleCover * zoom : FRAME_SIZE;
  const maxOffsetX = Math.max(0, (dispWidth - FRAME_SIZE) / 2);
  const maxOffsetY = Math.max(0, (dispHeight - FRAME_SIZE) / 2);

  // Used by the ZOOM buttons — always re-clamps pan against the new zoom
  // level's bounds, since zooming out shrinks how far the photo can be
  // offset before empty space would show. Pan itself is left where it was
  // (there's no "point between two fingers" for a button tap to anchor to).
  const applyZoom = (nextZoom: number, basePan: { x: number; y: number }) => {
    const z = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
    const dW = naturalSize ? naturalSize.width * scaleCover * z : FRAME_SIZE;
    const dH = naturalSize ? naturalSize.height * scaleCover * z : FRAME_SIZE;
    const maxX = Math.max(0, (dW - FRAME_SIZE) / 2);
    const maxY = Math.max(0, (dH - FRAME_SIZE) / 2);
    setZoom(z);
    setPan({ x: clamp(basePan.x, -maxX, maxX), y: clamp(basePan.y, -maxY, maxY) });
  };

  // Used by the pinch gesture — keeps whatever point of the photo was under
  // the fingers' midpoint at the start of this pinch anchored under that
  // same screen position as the zoom level changes, standard "pinch zooms
  // centered between the fingers" behavior, rather than zooming around the
  // frame's center regardless of where the fingers are.
  const applyPinchZoom = (
    nextZoom: number,
    startZoom: number,
    startPan: { x: number; y: number },
    center: { x: number; y: number }
  ) => {
    const z = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
    const scaleRatio = z / startZoom;
    const rawPanX = center.x - (center.x - startPan.x) * scaleRatio;
    const rawPanY = center.y - (center.y - startPan.y) * scaleRatio;
    const dW = naturalSize ? naturalSize.width * scaleCover * z : FRAME_SIZE;
    const dH = naturalSize ? naturalSize.height * scaleCover * z : FRAME_SIZE;
    const maxX = Math.max(0, (dW - FRAME_SIZE) / 2);
    const maxY = Math.max(0, (dH - FRAME_SIZE) / 2);
    setZoom(z);
    setPan({ x: clamp(rawPanX, -maxX, maxX), y: clamp(rawPanY, -maxY, maxY) });
  };

  // The two touches' midpoint, converted from screen coordinates into
  // "distance from the frame's own center" — the same coordinate space
  // `pan` already lives in.
  const pinchCenterOf = (touches: { pageX: number; pageY: number }[]) => {
    const midPageX = (touches[0].pageX + touches[1].pageX) / 2;
    const midPageY = (touches[0].pageY + touches[1].pageY) / 2;
    return {
      x: midPageX - frameOriginRef.current.x - FRAME_SIZE / 2,
      y: midPageY - frameOriginRef.current.y - FRAME_SIZE / 2,
    };
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          gestureRef.current.touchCount = touches.length;
          gestureRef.current.startZoom = zoom;
          gestureRef.current.startPan = pan;
          if (touches.length === 2) {
            gestureRef.current.startDistance = touchDistance(touches);
            gestureRef.current.pinchCenter = pinchCenterOf(touches);
          } else if (touches.length === 1) {
            gestureRef.current.startTouch = { x: touches[0].pageX, y: touches[0].pageY };
          }
        },
        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length !== gestureRef.current.touchCount) {
            // Finger count changed mid-gesture (e.g. 1 -> 2 fingers) — start
            // a fresh baseline from right now instead of jumping using a
            // stale reference point.
            gestureRef.current.touchCount = touches.length;
            gestureRef.current.startZoom = zoom;
            gestureRef.current.startPan = pan;
            if (touches.length === 2) {
              gestureRef.current.startDistance = touchDistance(touches);
              gestureRef.current.pinchCenter = pinchCenterOf(touches);
            } else if (touches.length === 1) {
              gestureRef.current.startTouch = { x: touches[0].pageX, y: touches[0].pageY };
            }
            return;
          }

          if (touches.length === 2) {
            const distance = touchDistance(touches);
            const scaleFactor = gestureRef.current.startDistance > 0 ? distance / gestureRef.current.startDistance : 1;
            applyPinchZoom(
              gestureRef.current.startZoom * scaleFactor,
              gestureRef.current.startZoom,
              gestureRef.current.startPan,
              gestureRef.current.pinchCenter
            );
          } else if (touches.length === 1) {
            const dx = touches[0].pageX - gestureRef.current.startTouch.x;
            const dy = touches[0].pageY - gestureRef.current.startTouch.y;
            setPan({
              x: clamp(gestureRef.current.startPan.x + dx, -maxOffsetX, maxOffsetX),
              y: clamp(gestureRef.current.startPan.y + dy, -maxOffsetY, maxOffsetY),
            });
          }
        },
        onPanResponderRelease: () => {
          gestureRef.current.touchCount = 0;
        },
        onPanResponderTerminate: () => {
          gestureRef.current.touchCount = 0;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom, pan, naturalSize, maxOffsetX, maxOffsetY]
  );

  if (!visible || !uri) return null;

  const confirm = async () => {
    if (!naturalSize) {
      onConfirm(uri);
      return;
    }
    setSaving(true);
    try {
      const effectiveScale = scaleCover * zoom;
      const cropLeftDisp = (dispWidth - FRAME_SIZE) / 2 - pan.x;
      const cropTopDisp = (dispHeight - FRAME_SIZE) / 2 - pan.y;
      const cropSizeNatural = FRAME_SIZE / effectiveScale;
      const originX = clamp(cropLeftDisp / effectiveScale, 0, Math.max(0, naturalSize.width - cropSizeNatural));
      const originY = clamp(cropTopDisp / effectiveScale, 0, Math.max(0, naturalSize.height - cropSizeNatural));

      const result = await manipulateAsync(
        uri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(cropSizeNatural),
              height: Math.round(cropSizeNatural),
            },
          },
          { resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } },
        ],
        { compress: 0.9, format: SaveFormat.JPEG }
      );
      onConfirm(result.uri);
    } catch (err) {
      showAlert('Could Not Crop Photo', "Something went wrong framing that photo — try again, or pick a different one.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, NO_TOUCH_ACTION]}>
        <View style={[styles.sheet, NO_TOUCH_ACTION]}>
          <Text style={styles.title}>CROP PHOTO</Text>
          <Text style={styles.subtitle}>Drag and pinch to frame your photo, then save.</Text>

          <View
            ref={frameRef}
            style={[styles.frame, NO_TOUCH_ACTION]}
            testID="crop-frame"
            {...panResponder.panHandlers}
          >
            <Image
              source={{ uri }}
              resizeMode="cover"
              style={[
                styles.image,
                {
                  width: dispWidth,
                  height: dispHeight,
                  transform: [{ translateX: pan.x }, { translateY: pan.y }],
                },
              ]}
            />
          </View>

          <View style={styles.zoomRow}>
            <Pressable
              style={styles.zoomButton}
              onPress={() => applyZoom(zoom - ZOOM_STEP, pan)}
              hitSlop={8}
              testID="crop-zoom-out"
            >
              <Ionicons name="remove" size={18} color={colors.green} />
            </Pressable>
            <Text style={styles.zoomLabel}>ZOOM</Text>
            <Pressable
              style={styles.zoomButton}
              onPress={() => applyZoom(zoom + ZOOM_STEP, pan)}
              hitSlop={8}
              testID="crop-zoom-in"
            >
              <Ionicons name="add" size={18} color={colors.green} />
            </Pressable>
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onCancel} testID="crop-cancel" disabled={saving}>
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, saving && styles.confirmButtonDisabled]}
              onPress={confirm}
              disabled={saving}
              testID="crop-confirm"
            >
              <Text style={styles.confirmButtonText}>{saving ? 'SAVING…' : 'USE PHOTO'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,33,28,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 22,
    alignItems: 'center',
  },
  title: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
  },
  subtitle: {
    alignSelf: 'flex-start',
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 16,
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderRadius: FRAME_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    position: 'absolute',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
  },
  zoomButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
