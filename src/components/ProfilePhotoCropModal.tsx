import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { colors, fonts } from '../theme';

const FRAME_SIZE = 240;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;

type Props = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
};

// A square crop/zoom step shown before a picked photo is saved as the
// profile picture — the OS picker's own crop UI isn't available on web,
// so this in-app frame + zoom control stands in on every platform.
export function ProfilePhotoCropModal({ visible, uri, onCancel, onConfirm }: Props) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (visible) setZoom(1);
  }, [visible]);

  if (!visible || !uri) return null;

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>CROP PHOTO</Text>
          <Text style={styles.subtitle}>Zoom to frame your photo, then save.</Text>

          <View style={styles.frame} testID="crop-frame">
            <Image
              source={{ uri }}
              resizeMode="cover"
              style={[styles.image, { transform: [{ scale: zoom }] }]}
            />
          </View>

          <View style={styles.zoomRow}>
            <Pressable
              style={styles.zoomButton}
              onPress={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
              hitSlop={8}
              testID="crop-zoom-out"
            >
              <Ionicons name="remove" size={18} color={colors.green} />
            </Pressable>
            <Text style={styles.zoomLabel}>ZOOM</Text>
            <Pressable
              style={styles.zoomButton}
              onPress={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
              hitSlop={8}
              testID="crop-zoom-in"
            >
              <Ionicons name="add" size={18} color={colors.green} />
            </Pressable>
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onCancel} testID="crop-cancel">
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={() => onConfirm(uri)} testID="crop-confirm">
              <Text style={styles.confirmButtonText}>USE PHOTO</Text>
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
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  image: {
    width: '100%',
    height: '100%',
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
  confirmButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
