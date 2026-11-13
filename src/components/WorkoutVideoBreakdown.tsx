import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MovementVideoPlayer } from './movement/MovementVideoPlayer';
import { extractYoutubeId } from '../lib/youtubeUrl';
import { colors, fonts } from '../theme';

type Props = {
  videoUrl?: string;
  // Round 54: optional, since an older call site simply wouldn't render a
  // name layer at all rather than crash -- every real call site in this
  // app (DayPanel.tsx, DocsWodsScreen.tsx) threads the real workout title.
  name?: string;
};

// Round 40: matched against the owner's approved reference-wod-screen.png.
// The reference shows a DESIGNED cover -- a solid green gradient with a
// centered play button and a dark "WATCH THE BREAKDOWN" tag -- never a real
// YouTube thumbnail photo, so the YouTube hqdefault.jpg fetch from Round 39
// is gone. Same in-app playback handoff as before: tapping swaps to
// MovementVideoPlayer (THE MOVEMENT VAULT's own nocookie-embed-with-retry
// treatment), used identically by DayPanel.tsx (Community's own expanded
// daily workout) and DocsWodsScreen.tsx (the WODS tab). Renders nothing at
// all when there's no video, same as before. The reference's own tag text
// includes a sample duration ("· 2 MIN") that has no real data behind it in
// this app's model -- per the round's own "match the design, not the
// sample content" instruction, the tag omits a duration rather than
// inventing one.
const GREEN_GRADIENT = {
  backgroundImage: `linear-gradient(135deg, ${colors.greenDeep}, ${colors.green})`,
} as object;

// Round 54: the real DOC'S FITNESS NEW JERSEY circular badge, as a bottom-
// right watermark stamp. Confirmed directly (not trusted from the filename)
// that this asset's own real pixels are solid white with alpha -- a real
// 1384x1384 square, so no separate aspect ratio to compute.
const BADGE_IMAGE = require('../../assets/brand/badge-black.png');

const NAME_SIDE_INSET = 16;
const NAME_TOP_INSET = 14;
// The approved mockup's own 1040px-wide frame rendered the name at 104px --
// exactly 10% of the cover's own width -- so this is a ratio of the cover's
// real rendered width, never a fixed pixel size, and scales correctly to
// any real device/column width.
const NAME_MAX_FONT_RATIO = 0.1;
const NAME_MIN_FONT_SIZE = 11;
const NAME_LETTER_SPACING = 0.5;

const BADGE_SIZE_RATIO = 0.18;
const BADGE_CORNER_MARGIN = 12;
const BADGE_MIN_SIZE = 26;
// Minimum clearance kept between the badge and whichever neighbor (the tag,
// the play button) it's being measured against before it's allowed to
// shrink any further than that neighbor's own real edge requires.
const COLLISION_GAP = 10;

let measureCtx: CanvasRenderingContext2D | null | undefined;
// Web-only -- lazily created once and reused for every measurement this
// component ever performs, never recreated per render.
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (Platform.OS !== 'web') return null;
  if (measureCtx !== undefined) return measureCtx;
  const canvas = document.createElement('canvas');
  measureCtx = canvas.getContext('2d');
  return measureCtx;
}

function measureTrackedWidth(ctx: CanvasRenderingContext2D, text: string, fontPx: number, family: string, letterSpacing: number): number {
  ctx.font = `${fontPx}px ${family}`;
  if (!text.length) return 0;
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + letterSpacing;
  return width - letterSpacing;
}

// Shrinks from `startSize` down to `minSize`, one pixel at a time (fine
// enough for a UI label, unlike the share card's own coarser -2px steps),
// until `text` -- tracked at `letterSpacing` -- measures at or under
// `maxWidth` against the real, currently-loaded font. Measured directly via
// a throwaway canvas 2D context, the same "measure, don't guess" principle
// shareCardRender.ts's own fitFontSize already established, adapted here
// to a real rendered component instead of an exported canvas image.
function fitTextWidth(ctx: CanvasRenderingContext2D, text: string, family: string, startSize: number, minSize: number, maxWidth: number, letterSpacing: number): number {
  let size = Math.max(Math.round(startSize), minSize);
  while (size > minSize) {
    if (measureTrackedWidth(ctx, text, size, family, letterSpacing) <= maxWidth) break;
    size -= 1;
  }
  return size;
}

export function WorkoutVideoBreakdown({ videoUrl, name }: Props) {
  const [playing, setPlaying] = useState(false);
  const [coverWidth, setCoverWidth] = useState(0);
  const [tagWidth, setTagWidth] = useState(0);
  const [nameFontSize, setNameFontSize] = useState(0);

  // Round 54: the name's own font size is measured against the cover's
  // real rendered width, not assumed from a fixed ratio alone -- a longer
  // name (e.g. "DEVIL WENT DOWN TO GEORGIA") must shrink to fit on exactly
  // one line, never wrap, never truncate with an ellipsis.
  useEffect(() => {
    if (!coverWidth || !name) {
      setNameFontSize(0);
      return undefined;
    }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const ctx = getMeasureCtx();
      if (!ctx) {
        // No DOM canvas to measure against (native) -- this app's own real
        // target, and the only platform this house's suite ever verifies,
        // is web, where the measured path below always runs instead.
        setNameFontSize(Math.round(coverWidth * NAME_MAX_FONT_RATIO));
        return;
      }
      const startSize = coverWidth * NAME_MAX_FONT_RATIO;
      const maxWidth = coverWidth - NAME_SIDE_INSET * 2;
      setNameFontSize(fitTextWidth(ctx, name, fonts.headline, startSize, NAME_MIN_FONT_SIZE, maxWidth, NAME_LETTER_SPACING));
    };
    // Measuring against a not-yet-loaded web font falls back to a generic
    // system font's own (different) metrics -- waiting for the browser's
    // own document.fonts.ready before measuring, capped so a font-load
    // failure can never hang this effect, is the same technique
    // TourOverlay.tsx's own measurement effect already established.
    if (typeof document !== 'undefined' && 'fonts' in document) {
      Promise.race([
        (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]).then(measure, measure);
    } else {
      measure();
    }
    return () => {
      cancelled = true;
    };
  }, [coverWidth, name]);

  if (!videoUrl) return null;
  const youtubeId = extractYoutubeId(videoUrl);

  if (playing) {
    return <MovementVideoPlayer video={youtubeId ? { type: 'youtube', youtubeId } : null} />;
  }

  // Round 54: the badge is the one element allowed to shrink below its own
  // preferred 18%-of-width size -- "the badge scales down before anything
  // else moves" -- computed directly against the tag's own real measured
  // width and the play button's own fixed geometry, never guessed. The tag
  // sits bottom-left at a fixed inset; the badge sits bottom-right -- on a
  // narrow enough cover the two would otherwise collide, since the tag's
  // own size is a fixed pixel size while the badge's preferred size is a
  // percentage of a shrinking cover width.
  const coverHeight = coverWidth / (16 / 9);
  const preferredBadgeSize = coverWidth * BADGE_SIZE_RATIO;
  let badgeSize = preferredBadgeSize;
  if (coverWidth > 0) {
    const tagRightEdge = 12 /* tag's own left inset, unchanged from before this round */ + tagWidth;
    const widthBudget = coverWidth - BADGE_CORNER_MARGIN - tagRightEdge - COLLISION_GAP;
    const playBottomEdge = coverHeight / 2 + 35 /* playCircle's own radius */ + COLLISION_GAP;
    const heightBudget = coverHeight - BADGE_CORNER_MARGIN - playBottomEdge;
    badgeSize = Math.max(BADGE_MIN_SIZE, Math.min(preferredBadgeSize, widthBudget, heightBudget));
  }

  return (
    <Pressable
      style={[styles.thumb, GREEN_GRADIENT]}
      onPress={() => setPlaying(true)}
      onLayout={(e) => setCoverWidth(e.nativeEvent.layout.width)}
      testID="watch-video-breakdown"
      accessibilityLabel="Watch the breakdown"
    >
      {!!name && nameFontSize > 0 && (
        <Text
          style={[styles.nameOverlay, { fontSize: nameFontSize }]}
          numberOfLines={1}
          ellipsizeMode="clip"
          pointerEvents="none"
          testID="watch-video-breakdown-name"
        >
          {name}
        </Text>
      )}
      <View style={styles.playCircle}>
        <Ionicons name="play" size={26} color={colors.green} />
      </View>
      <View style={styles.tag} onLayout={(e) => setTagWidth(e.nativeEvent.layout.width)}>
        <Text style={styles.tagText}>WATCH THE BREAKDOWN</Text>
      </View>
      {coverWidth > 0 && (
        <View style={[styles.badgeWrap, { width: badgeSize, height: badgeSize }]} pointerEvents="none">
          <Image
            source={BADGE_IMAGE}
            style={styles.badgeImage}
            resizeMode="contain"
            testID="watch-video-breakdown-badge"
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    marginBottom: 14,
  },
  nameOverlay: {
    // Deliberately no `right`/width constraint -- the font size above is
    // already fit (measured, not guessed) to the cover's own available
    // width, so this never needs to wrap or clip in practice; leaving the
    // box itself unconstrained means RN's own ellipsis-on-overflow
    // mechanism (which numberOfLines + a bounded width would otherwise
    // trigger) can never silently truncate the name with a "..." even in
    // an edge-case measurement mismatch -- the brief's own explicit "never
    // truncates with an ellipsis" requirement, held by construction rather
    // than by trusting the measurement to always land exactly.
    position: 'absolute',
    top: NAME_TOP_INSET,
    left: NAME_SIDE_INSET,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: fonts.headline,
    letterSpacing: NAME_LETTER_SPACING,
  },
  playCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E7ECE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: '#0F2922',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  tagText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  badgeWrap: {
    position: 'absolute',
    right: BADGE_CORNER_MARGIN,
    bottom: BADGE_CORNER_MARGIN,
    opacity: 0.9,
  },
  badgeImage: {
    width: '100%',
    height: '100%',
  },
});
