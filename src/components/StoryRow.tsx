import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StoryViewer } from './StoryViewer';
import { StoryLockedModal } from './StoryLockedModal';
import { DocsBadge } from './brand/DocsBadge';
import { useMembership } from '../context/MembershipContext';
import { useStories } from '../context/StoriesContext';
import { useTour } from '../context/TourContext';
import { colors, fonts } from '../theme';

const RING_SIZE = 64;
const AVATAR_SIZE = RING_SIZE - 10;
const COMPACT_RING_SIZE = 46;
const COMPACT_AVATAR_SIZE = COMPACT_RING_SIZE - 8;

type Props = {
  // Slim ring-only rendering for the inline slot on the Community date strip
  // — drops the "Doc" label and the "NEW" pill; the gold vs. hairline ring
  // color alone still signals unviewed vs. viewed.
  compact?: boolean;
};

export function StoryRow({ compact = false }: Props) {
  const { activeStories, hasUnviewed } = useStories();
  const { registerTarget } = useTour();
  const { storiesAccess } = useMembership();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  if (activeStories.length === 0) return null;

  const ringSize = compact ? COMPACT_RING_SIZE : RING_SIZE;
  const avatarSize = compact ? COMPACT_AVATAR_SIZE : AVATAR_SIZE;

  return (
    <View style={compact ? styles.compactRow : styles.row}>
      <Pressable
        ref={compact ? registerTarget('story-ring') : undefined}
        style={compact ? styles.compactItem : styles.item}
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
            <DocsBadge variant="white" size={avatarSize} />
          </View>
          {!compact && hasUnviewed && (
            <View style={styles.newTag}>
              <Text style={styles.newTagText}>NEW</Text>
            </View>
          )}
        </View>
        {!compact && <Text style={styles.itemLabel}>Doc</Text>}
      </Pressable>

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
  ringViewed: {
    borderColor: colors.hairline,
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
