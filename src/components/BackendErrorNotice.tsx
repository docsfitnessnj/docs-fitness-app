import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

type Props = {
  // Kept generic on purpose — every Supabase-backed screen (Community,
  // Trophy Case, My Workouts, Member Manager...) can hit the same two real
  // causes: the backend is unreachable, or supabase/setup.sql hasn't been
  // run yet in this project. Either way the member sees the same calm
  // message instead of a crash or a blank screen (see isBackendUnavailableError
  // in lib/supabaseClient.ts, which is what decides when to show this).
  message?: string;
};

export function BackendErrorNotice({ message }: Props) {
  return (
    <View style={styles.container} testID="backend-error-notice">
      <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
      <Text style={styles.title}>Can't load this right now</Text>
      <Text style={styles.body}>
        {message ?? "We couldn't reach Doc's Fitness servers. Check your connection and try again in a moment."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  body: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
