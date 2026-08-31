import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { TRIAL_WARNING_THRESHOLD, useMembership } from '../context/MembershipContext';
import { ONLINE_PLANS } from '../data/plans';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

const INCLUDED = [
  'Daily workouts — all 5 per week',
  'The full Deck of WODs',
  "Doc's COWS weekly challenge + leaderboard",
  'Full Community access',
];

export function TrialExpiryModal() {
  const { tier, daysLeftInTrial, trialWarningDismissed, dismissTrialWarning, becomeMember } = useMembership();

  const visible =
    tier === 'trial' &&
    daysLeftInTrial !== null &&
    daysLeftInTrial <= TRIAL_WARNING_THRESHOLD &&
    !trialWarningDismissed;

  const choosePlan = () => {
    becomeMember();
    dismissTrialWarning();
    showAlert('Payments Coming Soon', 'This is a preview — no charge yet.');
  };

  return (
    <AppModal visible={visible} transparent animationType="fade" onRequestClose={dismissTrialWarning}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Pressable onPress={dismissTrialWarning} hitSlop={8} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>

          <Text style={styles.headline}>YOUR TRIAL IS{'\n'}ALMOST OVER</Text>
          <Text style={styles.subtext}>
            {daysLeftInTrial === 0
              ? 'Your trial ends today.'
              : `${daysLeftInTrial} day${daysLeftInTrial === 1 ? '' : 's'} left.`}{' '}
            After it ends you'll drop to 2 workouts a week — no week preview, no Doc's COWS.
          </Text>

          <View style={styles.includedBox}>
            <Text style={styles.includedTitle}>UPGRADE NOW FOR FULL ACCESS</Text>
            {INCLUDED.map((item) => (
              <View key={item} style={styles.includedRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={styles.includedText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.planRow}>
            {ONLINE_PLANS.map((plan) => (
              <Pressable key={plan.key} style={styles.planButton} onPress={() => choosePlan()}>
                <Text style={styles.planButtonText}>
                  {plan.price} / {plan.cadence.replace('/ ', '').toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={dismissTrialWarning} hitSlop={8} style={styles.laterLink}>
            <Text style={styles.laterLinkText}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,33,28,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },
  headline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: 1,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 20,
  },
  includedBox: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  includedTitle: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  includedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  includedText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    marginLeft: 8,
  },
  planRow: {
    flexDirection: 'row',
    gap: 10,
  },
  planButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  planButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  laterLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  laterLinkText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
