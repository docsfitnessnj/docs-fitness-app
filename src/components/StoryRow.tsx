import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StoryViewer } from './StoryViewer';
import { DocsBadge } from './brand/DocsBadge';
import { useStories } from '../context/StoriesContext';
import { colors, fonts } from '../theme';

const RING_SIZE = 64;
const AVATAR_SIZE = RING_SIZE - 10;

export function StoryRow() {
  const { activeStories, hasUnviewed } = useStories();
  const [viewerOpen, setViewerOpen] = useState(false);

  if (activeStories.length === 0) return null;

  return (
    <View style={styles.row}>
      <Pressable style={styles.item} onPress={() => setViewerOpen(true)} testID="story-ring-doc">
        <View style={[styles.ring, hasUnviewed ? styles.ringUnviewed : styles.ringViewed]}>
          <View style={styles.avatar}>
            <DocsBadge variant="white" size={AVATAR_SIZE} />
          </View>
          {hasUnviewed && (
            <View style={styles.newTag}>
              <Text style={styles.newTagText}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={styles.itemLabel}>Doc</Text>
      </Pressable>

      {viewerOpen && (
        <StoryViewer stories={activeStories} startIndex={0} onClose={() => setViewerOpen(false)} />
      )}
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
