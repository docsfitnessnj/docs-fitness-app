import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { TRIAL_WARNING_THRESHOLD, useMembership } from '../context/MembershipContext';
import { showAlert } from '../lib/alert';
import { claimInterruption, releaseInterruption, useInterruptionOwner } from '../lib/interruptionGate';
import { openBillingPortal } from '../lib/stripeCheckout';
import { colors, fonts } from '../theme';

const INCLUDED = [
  'Daily workouts — all 5 per week',
  'The full Deck of WODs',
  "Doc's COWS weekly challenge + leaderboard",
  'Full Community access',
];

// A real trial (started via Stripe Checkout) already has a card on file and
// a specific price attached — unlike the old simulated trial, doing nothing
// does NOT drop a member to the free tier when it ends; their card is
// charged automatically and the same plan continues. This just reminds them
// that's coming and offers a way to switch plans or cancel first, via the
// same Stripe billing portal MANAGE MEMBERSHIP uses everywhere else.
export function TrialExpiryModal() {
  const { tier, daysLeftInTrial, trialWarningDismissed, dismissTrialWarning } = useMembership();
  const [opening, setOpening] = useState(false);
  const owner = useInterruptionOwner();

  const eligible =
    tier === 'trial' &&
    daysLeftInTrial !== null &&
    daysLeftInTrial <= TRIAL_WARNING_THRESHOLD &&
    !trialWarningDismissed;

  // Claims the shared interruption slot (interruptionGate.ts) the moment
  // this becomes eligible and nothing else already holds it, and keeps
  // re-attempting whenever ownership frees up (the tour finishing, say) for
  // as long as it stays eligible — unlike the upgrade nudge, this one has
  // no "skip silently for the rest of the session" rule of its own: a
  // card about to be charged is real information the member still needs
  // once whatever pre-empted it is done, not a marketing nudge to shelve.
  // Never shows WHILE something else owns the slot, never shows AT THE
  // SAME TIME as anything else — that's the one rule this round actually
  // adds here.
  useEffect(() => {
    if (!eligible) {
      releaseInterruption('trialExpiry');
      return;
    }
    if (owner === null) {
      claimInterruption('trialExpiry');
    }
  }, [eligible, owner]);

  // Releases on unmount too, for hygiene — this component is mounted for
  // the whole signed-in session in practice, but never leave the slot
  // claimed by something that's gone.
  useEffect(() => () => releaseInterruption('trialExpiry'), []);

  const visible = eligible && owner === 'trialExpiry';

  const managePlan = async () => {
    setOpening(true);
    const { error } = await openBillingPortal();
    setOpening(false);
    if (error) showAlert("Couldn't Open Billing", error);
  };

  return (
    <AppModal visible={visible} transparent animationType="fade" onRequestClose={dismissTrialWarning}>
      <Pressable style={styles.backdrop} onPress={dismissTrialWarning}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Pressable onPress={dismissTrialWarning} hitSlop={8} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>

          <Text style={styles.headline}>YOUR TRIAL IS{'\n'}ALMOST OVER</Text>
          <Text style={styles.subtext}>
            {daysLeftInTrial === 0
              ? 'Your trial ends today.'
              : `${daysLeftInTrial} day${daysLeftInTrial === 1 ? '' : 's'} left.`}{' '}
            Your card will be charged automatically and your plan will continue — nothing to do unless you'd like to
            switch plans or cancel first.
          </Text>

          <View style={styles.includedBox}>
            <Text style={styles.includedTitle}>WHAT'S INCLUDED</Text>
            {INCLUDED.map((item) => (
              <View key={item} style={styles.includedRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={styles.includedText}>{item}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.manageButton} onPress={managePlan} disabled={opening} testID="trial-manage-plan">
            {opening ? <ActivityIndicator color={colors.white} /> : <Text style={styles.manageButtonText}>MANAGE MY PLAN</Text>}
          </Pressable>

          <Pressable onPress={dismissTrialWarning} hitSlop={8} style={styles.laterLink}>
            <Text style={styles.laterLinkText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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
  manageButton: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  manageButtonText: {
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
