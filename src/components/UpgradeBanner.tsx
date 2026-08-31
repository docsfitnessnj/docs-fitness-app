import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadJSON, saveJSON } from '../lib/storage';
import { openMemberships } from '../lib/membershipsModal';
import { colors, fonts } from '../theme';

const STORAGE_KEY = 'docsfitness.upgradeBannerDismissed.v1';

type Props = {
  message: string;
};

// Small, dismissible, never-blocking upsell — the opposite of a popup.
// Dismissal persists so it doesn't reappear every time a free member taps a locked day.
export function UpgradeBanner({ message }: Props) {
  const [dismissed, setDismissed] = useState(() => loadJSON(STORAGE_KEY, false));

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    saveJSON(STORAGE_KEY, true);
  };

  return (
    <View style={styles.banner}>
      <Ionicons name="star" size={14} color={colors.gold} />
      <Pressable style={styles.textWrap} onPress={() => openMemberships('unlock')} testID="upgrade-banner-unlock">
        <Text style={styles.text}>{message}</Text>
        <Ionicons name="chevron-forward" size={13} color={colors.green} />
      </Pressable>
      <Pressable onPress={dismiss} hitSlop={8} testID="upgrade-banner-dismiss">
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    gap: 8,
  },
  textWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
    marginRight: 4,
  },
});
