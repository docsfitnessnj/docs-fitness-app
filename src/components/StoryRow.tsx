import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StoryViewer } from './StoryViewer';
import { useStories } from '../context/StoriesContext';
import { colors, fonts } from '../theme';

export function StoryRow() {
  const { activeStories, hasUnviewed } = useStories();
  const [viewerOpen, setViewerOpen] = useState(false);

  if (activeStories.length === 0) return null;

  return (
    <View style={styles.row}>
      <Pressable style={styles.item} onPress={() => setViewerOpen(true)} testID="story-ring-doc">
        <View style={[styles.ring, hasUnviewed ? styles.ringUnviewed : styles.ringViewed]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>D</Text>
          </View>
        </View>
        <Text style={styles.itemLabel}>Doc</Text>
      </Pressable>

      {viewerOpen && (
        <StoryViewer stories={activeStories} startIndex={0} onClose={() => setViewerOpen(false)} />
      )}
    </View>
  );
}

const RING_SIZE = 64;

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
    borderColor: colors.highlight,
  },
  ringViewed: {
    borderColor: colors.locked,
  },
  avatar: {
    width: RING_SIZE - 10,
    height: RING_SIZE - 10,
    borderRadius: (RING_SIZE - 10) / 2,
    backgroundColor: colors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.background,
  },
  avatarText: {
    color: colors.highlight,
    fontFamily: fonts.headline,
    fontSize: 22,
  },
  itemLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
