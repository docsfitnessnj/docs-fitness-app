import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { StoryItem, useStories } from '../context/StoriesContext';
import { colors, fonts } from '../theme';

const ITEM_DURATION_MS = 5000;
const SWIPE_DOWN_CLOSE_THRESHOLD = 80;

type Props = {
  stories: StoryItem[];
  startIndex: number;
  onClose: () => void;
};

export function StoryViewer({ stories, startIndex, onClose }: Props) {
  const { markViewed } = useStories();
  const [index, setIndex] = useState(startIndex);
  const progressAnims = useRef(stories.map(() => new Animated.Value(0))).current;
  const dragY = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    setIndex((prev) => {
      if (prev >= stories.length - 1) {
        onClose();
        return prev;
      }
      return prev + 1;
    });
  };

  const goBack = () => {
    setIndex((prev) => Math.max(0, prev - 1));
  };

  useEffect(() => {
    const current = stories[index];
    if (!current) return;
    markViewed(current.id);

    progressAnims.forEach((anim, i) => {
      if (i < index) anim.setValue(1);
      else if (i > index) anim.setValue(0);
    });

    progressAnims[index].setValue(0);
    const animation = Animated.timing(progressAnims[index], {
      toValue: 1,
      duration: ITEM_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) goNext();
    });

    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > SWIPE_DOWN_CLOSE_THRESHOLD) {
          onClose();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const current = stories[index];
  if (!current) return null;

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        style={[styles.container, { backgroundColor: current.placeholderColor, transform: [{ translateY: dragY }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.progressRow}>
          {stories.map((story, i) => (
            <View key={story.id} style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.headerRow}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.backButton} testID="story-back">
            <Ionicons name="chevron-back" size={22} color={colors.white} />
            <Text style={styles.backButtonText}>BACK</Text>
          </Pressable>
          <Text style={styles.headerText}>DOC</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeButtonSlot} testID="story-close">
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.mediaArea}>
          <Ionicons
            name={current.mediaType === 'video' ? 'videocam-outline' : 'image-outline'}
            size={72}
            color="rgba(255,255,255,0.55)"
          />
          <Text style={styles.mediaLabel}>{current.placeholderLabel}</Text>
        </View>

        <View style={styles.tapZones} pointerEvents="box-none">
          <Pressable style={styles.tapZoneLeft} onPress={goBack} testID="story-tap-left" />
          <Pressable style={styles.tapZoneRight} onPress={goNext} testID="story-tap-right" />
        </View>
      </Animated.View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.white,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
    textAlign: 'center',
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
  },
  backButtonText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  closeButtonSlot: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  mediaArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 15,
    letterSpacing: 0.5,
    marginTop: 16,
  },
  tapZones: {
    position: 'absolute',
    top: 90,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tapZoneLeft: {
    flex: 35,
  },
  tapZoneRight: {
    flex: 65,
  },
});
