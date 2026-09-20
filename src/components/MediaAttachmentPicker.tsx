import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MediaAttachment } from '../lib/media';
import { useMediaPicker } from '../lib/useMediaPicker';
import { colors, fonts } from '../theme';

type Props = {
  media: MediaAttachment | null;
  onChange: (media: MediaAttachment | null) => void;
  // The community composer's Skool-style layout wants a single quiet
  // toolbar row (small icon + label, no box) instead of the large dashed
  // "add" button Log Results still uses — same picker and preview either
  // way, just a slimmer trigger when nothing's attached yet.
  compact?: boolean;
};

// Shared "ADD PHOTO / VIDEO" control used on Log Results and the community
// composer — same picker, same thumbnail-preview-with-remove/replace
// pattern, so an attachment picked in one place looks and behaves like one
// picked in the other.
export function MediaAttachmentPicker({ media, onChange, compact }: Props) {
  const { pick } = useMediaPicker(onChange);

  if (media) {
    return (
      <View style={styles.previewWrap} testID="media-preview">
        {media.type === 'image' ? (
          <Image source={{ uri: media.uri }} style={styles.previewImage} />
        ) : (
          <View style={styles.previewVideo}>
            <Ionicons name="videocam" size={26} color={colors.white} />
            <Text style={styles.previewVideoText}>VIDEO ATTACHED</Text>
          </View>
        )}
        <View style={styles.previewActions}>
          <Pressable style={styles.previewActionBtn} onPress={pick} testID="media-replace">
            <Text style={styles.previewActionText}>REPLACE</Text>
          </Pressable>
          <Pressable
            style={[styles.previewActionBtn, styles.previewRemoveBtn]}
            onPress={() => onChange(null)}
            testID="media-remove"
          >
            <Ionicons name="close" size={14} color={colors.white} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={compact ? styles.addButtonCompact : styles.addButton} onPress={pick} testID="media-add">
      <Ionicons name="camera-outline" size={compact ? 20 : 18} color={colors.green} />
      <Text style={compact ? styles.addButtonTextCompact : styles.addButtonText}>ADD PHOTO / VIDEO</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 13,
  },
  addButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  addButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
  },
  addButtonTextCompact: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  previewWrap: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 160,
    backgroundColor: colors.background,
  },
  previewVideo: {
    width: '100%',
    height: 160,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewVideoText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  previewActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  previewActionBtn: {
    backgroundColor: 'rgba(18,33,28,0.7)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewActionText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  previewRemoveBtn: {
    paddingHorizontal: 6,
  },
});
