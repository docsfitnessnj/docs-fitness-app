import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  title: string;
  subtitle: string;
  // The second section on a shared screen (Memberships) needs a visible
  // break from the one above it — a divider plus extra top space — so the
  // two tracks read as clearly separate, not a continuation of one list.
  spaced?: boolean;
};

export function PlanSectionHeader({ title, subtitle, spaced = false }: Props) {
  return (
    <View style={[styles.wrap, spaced && styles.spaced]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 20,
  },
  spaced: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 30,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 3,
  },
});
