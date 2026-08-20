import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  // Defaults to the general "join to unlock everything" pitch — pass a
  // specific line (e.g. for a single locked feature like Doc's Daily Story)
  // to explain exactly what's behind the gate here.
  subtext?: string;
};

const DEFAULT_SUBTEXT = 'Daily workouts. The full Deck of WODs. Weekly challenges. Community.';

// The "JOIN THE BOATHOUSE" lock visual — shared by MembershipGate (wraps a
// whole locked tab) and any locked-feature popup (e.g. the story ring for
// guests/free members) that needs the exact same look with different copy.
export function JoinBoathouseLock({ subtext = DEFAULT_SUBTEXT }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.lockCircle}>
        <Ionicons name="lock-closed" size={36} color={colors.green} />
      </View>
      <Text style={styles.heading}>JOIN THE BOATHOUSE</Text>
      <Text style={styles.subtext}>{subtext}</Text>
      <Pressable
        style={styles.unlockButton}
        onPress={() => showAlert('Unlock Everything', 'Membership purchases are coming soon.')}
        testID="unlock-everything-button"
      >
        <Text style={styles.unlockButtonText}>UNLOCK EVERYTHING</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  lockCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 30,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  unlockButton: {
    backgroundColor: colors.green,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  unlockButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
