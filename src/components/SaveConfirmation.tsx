import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SaveConfirmationState } from '../lib/useSaveConfirmation';
import { colors, fonts } from '../theme';

type Props = {
  state: SaveConfirmationState;
  errorMessage?: string | null;
};

// The app-wide "did this save actually go through" confirmation — a small
// gold-checkmark SAVED line right beside (or under) the action once it
// succeeds, or a plain error line if it didn't. Never shown optimistically
// — only ever rendered once the write has actually resolved. See
// useSaveConfirmation for the state machine this reads.
export function SaveConfirmation({ state, errorMessage }: Props) {
  if (state === 'saved') {
    return (
      <View style={styles.row} testID="save-confirmation-saved">
        <Ionicons name="checkmark-circle" size={16} color={colors.green} />
        <Text style={styles.savedText}>SAVED</Text>
      </View>
    );
  }
  if (state === 'error') {
    return (
      <Text style={styles.errorText} testID="save-confirmation-error">
        {errorMessage ?? "Couldn't save. Try again."}
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  savedText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  errorText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
});
