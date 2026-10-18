import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppPressable } from './AppPressable';
import { colors, fonts } from '../theme';

type Props = {
  title: string;
  onBack: () => void;
  backTestID?: string;
  // Overrides the "BACK" text — used where a screen can be reached from more
  // than one place and it's worth naming the specific destination (e.g. a
  // movement opened from a workout shows "BACK TO WORKOUT" instead of a
  // plain "BACK" that doesn't say where it's actually going).
  backLabel?: string;
  // A small line under the title, same gold/condensed-caps treatment as
  // AppTopBar's own subtitle — e.g. Doc's Group Chat's "X IN THE CHAT"
  // presence line. Omit for the plain single-line header every other screen
  // uses.
  subtitle?: string;
  // Replaces the header's fixed right-side spacer with a real control (e.g.
  // an admin-only ellipsis) — same width footprint either way, so the title
  // stays centered whether or not this is passed.
  rightElement?: React.ReactNode;
};

// Standard header for every full-screen modal that isn't a main tab: a clear
// chevron + "BACK" control (top left) instead of a bare X, per the app-wide
// rule that nothing should be closeable only by an ambiguous discard tap.
export function ModalHeader({ title, onBack, backTestID, backLabel, subtitle, rightElement }: Props) {
  return (
    <View style={styles.header}>
      <AppPressable onPress={onBack} hitSlop={8} style={styles.backButton} testID={backTestID ?? 'modal-back'}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
        <Text style={styles.backText} numberOfLines={1}>
          {backLabel ?? 'BACK'}
        </Text>
      </AppPressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.spacer}>{rightElement}</View>
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
    minWidth: 84,
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.gold,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  spacer: {
    width: 84,
    alignItems: 'flex-end',
  },
});
