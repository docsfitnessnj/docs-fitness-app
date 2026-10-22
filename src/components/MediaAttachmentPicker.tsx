import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
// The box's ratio before the real photo's own dimensions are known -- and,
// if they never arrive, forever. A previous round computed the preview's
// height in JS (containerWidth / naturalRatio from Image.getSize()) and
// fell back to a plain numeric height when that measurement hadn't
// resolved yet; a real iPhone showed that fallback never actually painted
// anything -- Image.getSize() opens its OWN separate decode of the photo
// (blob/data URI, often HEIC-converted by the picker), independent of
// whatever the visible <Image> itself is doing, and on that device it
// never resolved at all, silently leaving the preview blank with REPLACE/
// remove floating over nothing. Using CSS `aspectRatio` here instead means
// the box's height is derived purely from its own rendered width by the
// browser/layout engine -- no JS measurement, no state that can stay null,
// nothing that can leave it at zero. It paints at this sensible default the
// instant a photo is picked, full stop.
const DEFAULT_PREVIEW_RATIO = 4 / 3;

// Shared "ADD PHOTO / VIDEO" control used on Log Results and the community
// composer — same picker, same thumbnail-preview-with-remove/replace
// pattern, so an attachment picked in one place looks and behaves like one
// picked in the other.
export function MediaAttachmentPicker({ media, onChange, compact }: Props) {
  const { pick } = useMediaPicker(onChange);
  const { height: screenHeight } = useWindowDimensions();
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  // Refines the default box to the photo's real shape once its own
  // dimensions are known. Deliberately NOT react-native-web's own Image
  // onLoad plumbing -- that forwards the browser's native `load` event as
  // `nativeEvent`, and reading `nativeEvent.target` off it turns out to be
  // exactly the trap this round's real-device bug was hiding in: Chromium
  // confirmed directly (`e.target === img` true synchronously inside
  // `onload`, false one microtask later) that an Event's own `target`
  // goes stale the moment react-native-web's internal `image.decode()`
  // promise resolves -- which is ALWAYS one microtask after `onload`
  // fires, so `nativeEvent.target` is unconditionally null by the time any
  // onLoad handler built on top of it ever runs. A plain `window.Image()`
  // probe -- the real "web image onLoad" API -- sidesteps this entirely
  // by reading `naturalWidth`/`naturalHeight` directly off the Image
  // object itself, inside its OWN synchronous `onload`, never through a
  // stale event reference. If it never fires (or the photo genuinely can't
  // decode), DEFAULT_PREVIEW_RATIO above keeps showing the photo contained
  // -- never blank.
  useEffect(() => {
    setNaturalRatio(null);
    if (media?.type !== 'image') return;
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.Image !== 'function') {
      // Native has no equivalent event-staleness issue -- Image.getSize()
      // is the ordinary, reliable way to get this there.
      let cancelled = false;
      Image.getSize(
        media.uri,
        (w, h) => {
          if (!cancelled && h > 0) setNaturalRatio(w / h);
        },
        () => {}
      );
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (cancelled) return;
      const { naturalWidth: w, naturalHeight: h } = probe;
      if (w && h) setNaturalRatio(w / h);
    };
    probe.src = media.uri;
    return () => {
      cancelled = true;
    };
  }, [media?.uri, media?.type]);

  if (media) {
    const maxHeight = screenHeight * MAX_PREVIEW_HEIGHT_FRACTION;
    const ratio = naturalRatio ?? DEFAULT_PREVIEW_RATIO;

    return (
      <View style={styles.previewWrap} testID="media-preview">
        {media.type === 'image' ? (
          <Image
            source={{ uri: media.uri }}
            // 'contain' always: once the real ratio is known the box
            // matches it exactly (nothing cropped); before that, or if it
            // never arrives, contain is what keeps the whole photo visible
            // within the 4:3 default instead of cropping it to fill it.
            // Capped (an unusually tall photo) is the same story once
            // maxHeight actually binds.
            resizeMode="contain"
            style={[styles.previewImage, { aspectRatio: ratio, maxHeight }]}
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
    // aspectRatio + maxHeight are set inline per-instance (DEFAULT_PREVIEW_RATIO
    // until the real photo's dimensions arrive, then its natural ratio,
    // capped at MAX_PREVIEW_HEIGHT_FRACTION of the screen) -- see the
    // component body.
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
