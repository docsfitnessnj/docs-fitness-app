import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppModal } from './AppModal';
import { ModalHeader } from './ModalHeader';
import { JoinBoathouseLock } from './JoinBoathouseLock';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Doc's Daily Story is a paid feature — free-tier members still see the
// ring (gold-unviewed state and all), but tapping it opens this instead of
// the real story viewer.
export function StoryLockedModal({ visible, onClose }: Props) {
  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container} nativeID="story-locked-safe-top">
        <ModalHeader title="DOC'S DAILY STORY" onBack={onClose} backTestID="close-story-locked" />
        <JoinBoathouseLock subtext="Doc's Daily Story is for members." onUnlock={onClose} />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  // paddingTop here is the ordinary-browser-chrome value; index.html's
  // #story-locked-safe-top rule adds the real env(safe-area-inset-top) on
  // top of it in standalone mode -- a single additive source. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
});
