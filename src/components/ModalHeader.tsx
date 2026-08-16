import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

type Props = {
  title: string;
  onBack: () => void;
  backTestID?: string;
};

// Standard header for every full-screen modal that isn't a main tab: a clear
// chevron + "BACK" control (top left) instead of a bare X, per the app-wide
// rule that nothing should be closeable only by an ambiguous discard tap.
export function ModalHeader({ title, onBack, backTestID }: Props) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID={backTestID ?? 'modal-back'}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 84,
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
  },
  spacer: {
    width: 84,
  },
});
