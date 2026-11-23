import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StoryViewer } from './StoryViewer';
import { StoryLockedModal } from './StoryLockedModal';
import { KettlewaveMark } from './brand/KettlewaveMark';
import { useMembership } from '../context/MembershipContext';
import { useStories } from '../context/StoriesContext';
import { useTour } from '../context/TourContext';
import { useMediaPicker } from '../lib/useMediaPicker';
import { colors, fonts } from '../theme';

const RING_SIZE = 64;
const AVATAR_SIZE = RING_SIZE - 10;
const COMPACT_RING_SIZE = 46;
const COMPACT_AVATAR_SIZE = COMPACT_RING_SIZE - 8;
const ADD_BADGE_SIZE = 22;
const COMPACT_ADD_BADGE_SIZE = 18;

// Fills the white avatar circle confidently while still leaving a small
// margin so the mark never touches the ring -- the mark itself is a
// compact kettlebell shape (not edge-to-edge like the full badge), so this
// can run noticeably higher than DocsBadge's own inset ratio.
const MARK_FILL_RATIO = 0.88;

type Props = {
  // Slim ring-only rendering for the inline slot on the Community date strip
  // — drops the "Doc" label and the "NEW" pill; the gold vs. green ring
  // color alone still signals unviewed vs. viewed.
  compact?: boolean;
  // Round 66: admin-only ADD TO STORY affordance -- see AGENTS.md for why
  // this is a persistent badge/button next to the ring rather than a
  // long-press on it (the ring doesn't exist at all on a day with zero
  // live stories, which would leave admin with no way to post the very
  // first one of the day).
  isAdmin?: boolean;
};

export function StoryRow({ compact = false, isAdmin = false }: Props) {
  const { activeStories, hasUnviewed, posting, postStory } = useStories();
  const { registerTarget } = useTour();
  const { storiesAccess } = useMembership();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  const { pick } = useMediaPicker((media) => {
    if (media) postStory(media);
  });

  if (activeStories.length === 0 && !isAdmin) return null;

  const ringSize = compact ? COMPACT_RING_SIZE : RING_SIZE;
  const avatarSize = compact ? COMPACT_AVATAR_SIZE : AVATAR_SIZE;
  const addBadgeSize = compact ? COMPACT_ADD_BADGE_SIZE : ADD_BADGE_SIZE;

  return (
    <View style={compact ? styles.compactRow : styles.row}>
      {activeStories.length > 0 ? (
        <View style={compact ? styles.compactItem : styles.item}>
          <Pressable
            ref={compact ? registerTarget('story-ring') : undefined}
            onPress={() => (storiesAccess ? setViewerOpen(true) : setLockedOpen(true))}
            testID="story-ring-doc"
          >
            <View
              style={[
                styles.ring,
                { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
                hasUnviewed ? styles.ringUnviewed : styles.ringViewed,
              ]}
            >
              <View
                style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
              >
                <KettlewaveMark height={avatarSize * MARK_FILL_RATIO} />
              </View>
              {!compact && hasUnviewed && (
                <View style={styles.newTag}>
                  <Text style={styles.newTagText}>NEW</Text>
                </View>
              )}
            </View>
            {!compact && <Text style={styles.itemLabel}>Doc</Text>}
          </Pressable>
          {isAdmin && (
            <Pressable
              onPress={pick}
              disabled={posting}
              style={[styles.addBadge, { width: addBadgeSize, height: addBadgeSize, borderRadius: addBadgeSize / 2 }]}
              testID="story-add-badge"
              hitSlop={6}
            >
              {posting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="add" size={addBadgeSize * 0.65} color={colors.white} />
              )}
            </Pressable>
          )}
        </View>
      ) : (
        // No live story today -- admin still gets a quiet way to post the
        // very first one, since the ring itself doesn't exist to long-press
        // on (or add a badge to) yet.
        <Pressable
          style={compact ? styles.compactItem : styles.item}
          onPress={pick}
          disabled={posting}
          testID="story-add-empty"
        >
          <View
            style={[styles.ring, styles.ringEmpty, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
          >
            {posting ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons name="add" size={ringSize * 0.4} color={colors.textMuted} />
            )}
          </View>
          {!compact && <Text style={styles.itemLabel}>Add Story</Text>}
        </Pressable>
      )}

      {viewerOpen && (
        <StoryViewer stories={activeStories} startIndex={0} onClose={() => setViewerOpen(false)} />
      )}
      <StoryLockedModal visible={lockedOpen} onClose={() => setLockedOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  compactRow: {
    marginBottom: 0,
  },
  compactItem: {
    alignItems: 'center',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ringUnviewed: {
    borderColor: colors.gold,
  },
  // Augusta green, not a neutral gray -- "watched" still reads as a
  // deliberate brand-colored state, not a disabled/greyed-out one.
  ringViewed: {
    borderColor: colors.green,
  },
  // The no-live-story-yet state, admin only -- a plain dashed-feeling
  // neutral ring (no gold/green signal, since there's nothing to signal
  // viewed/unviewed about) around a quiet "+" inviting the day's first
  // post.
  ringEmpty: {
    borderColor: colors.hairline,
    borderStyle: 'dashed',
  },
  addBadge: {
    position: 'absolute',
    right: -2,
    bottom: 6,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.card,
    overflow: 'hidden',
  },
  newTag: {
    position: 'absolute',
    bottom: -3,
    backgroundColor: colors.gold,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  newTagText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  itemLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
