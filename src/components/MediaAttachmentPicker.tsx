import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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

// Fraction of the screen's own height the preview may use before it caps
// out and switches to letterboxed (contain) instead of growing further —
// a real device confirmed a selected photo must preview at its actual
// shape, not a fixed-height crop, but an extremely tall photo still needs
// a ceiling so it doesn't push the rest of the composer off screen.
const MAX_PREVIEW_HEIGHT_FRACTION = 0.6;
// Shown only for the instant between picking a photo and Image.getSize()
// resolving its real dimensions -- a plausible starting box, not a
// meaningful default otherwise.
const FALLBACK_PREVIEW_HEIGHT = 200;

// Shared "ADD PHOTO / VIDEO" control used on Log Results and the community
// composer — same picker, same thumbnail-preview-with-remove/replace
// pattern, so an attachment picked in one place looks and behaves like one
// picked in the other.
export function MediaAttachmentPicker({ media, onChange, compact }: Props) {
  const { pick } = useMediaPicker(onChange);
  const { height: screenHeight } = useWindowDimensions();
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Real device report: the preview rendered as a wide horizontal crop
  // (a fixed 160px-tall box with the default `cover` resize) while the
  // posted photo later rendered correctly at its own shape -- the preview
  // must show exactly what posting will. Image.getSize() reads the real
  // decoded dimensions directly from the file/blob URI, independent of
  // whatever box the Image element itself ends up rendered at.
  useEffect(() => {
    setNaturalRatio(null);
    if (media?.type !== 'image') return;
    let cancelled = false;
    Image.getSize(
      media.uri,
      (w, h) => {
        if (!cancelled && h > 0) setNaturalRatio(w / h);
      },
      () => {
        // Leave naturalRatio null -- falls back to FALLBACK_PREVIEW_HEIGHT
        // below rather than a dead/blank box.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [media?.uri, media?.type]);

  if (media) {
    const maxHeight = screenHeight * MAX_PREVIEW_HEIGHT_FRACTION;
    const naturalHeight = naturalRatio && containerWidth ? containerWidth / naturalRatio : null;
    const previewHeight = naturalHeight !== null ? Math.min(naturalHeight, maxHeight) : FALLBACK_PREVIEW_HEIGHT;

    return (
      <View
        style={styles.previewWrap}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        testID="media-preview"
      >
        {media.type === 'image' ? (
          <Image
            source={{ uri: media.uri }}
            // 'contain' always: when the box isn't capped, its ratio
            // already exactly matches the image's own (computed above), so
            // contain and cover render identically with nothing cropped;
            // when it IS capped (an unusually tall photo), contain is what
            // keeps the whole image visible, letterboxed, instead of
            // cropping it to fit the cap.
            resizeMode="contain"
            style={[styles.previewImage, { height: previewHeight }]}
          />
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
    // Explicit, not just the Image's own `width: '100%'` below -- the
    // community composer's toolbar is a row flex container
    // (CreatePostModal's `composeToolbar`), and a flex item with no width
    // of its own sizes to its CONTENT's intrinsic width first, which
    // treats a descendant's percentage width as contributing nothing (the
    // CSS Flexbox spec's own rule for automatic sizing) -- collapsing this
    // box toward zero width and leaving only its `backgroundColor` to show
    // through as a blank area where the photo preview belongs. Declaring
    // the width here, on the flex item itself, resolves directly against
    // the toolbar's own (non-auto) width instead of going through that
    // content-sizing pass. Log Results' own plain, non-flex `mediaWrap`
    // never hit this, which is why only the community composer did.
    width: '100%',
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
  },
  previewImage: {
    // Height is set inline per-instance (natural aspect ratio, capped at
    // MAX_PREVIEW_HEIGHT_FRACTION of the screen) -- see the component body.
    width: '100%',
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
