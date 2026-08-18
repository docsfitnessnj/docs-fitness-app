import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { InPersonPlan, useMembership } from '../context/MembershipContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type OnlinePlan = {
  key: 'monthly' | 'annual';
  name: string;
  price: string;
  cadence: string;
  note?: string;
};

const ONLINE_PLANS: OnlinePlan[] = [
  { key: 'monthly', name: 'MONTHLY', price: '$39', cadence: '/ month' },
  { key: 'annual', name: 'ANNUAL', price: '$351', cadence: '/ year', note: '3 MONTHS FREE' },
];

type InPerson = {
  key: InPersonPlan;
  name: string;
  price: string;
  cadence: string;
  bullets: string[];
  bestValue?: boolean;
};

const IN_PERSON_PLANS: InPerson[] = [
  {
    key: 'monthly_unlimited',
    name: 'MONTHLY UNLIMITED',
    price: '$130',
    cadence: '/ month',
    bullets: ['Unlimited Boathouse classes', 'Full app included — all WODs, COWS, Deck, community'],
    bestValue: true,
  },
  {
    key: 'ten_pack',
    name: '10 CLASS PACK',
    price: '$250',
    cadence: '',
    bullets: ['Ten classes, expires 1 year from purchase', 'App community + booking access', 'Workouts locked'],
  },
  {
    key: 'drop_in',
    name: 'DROP IN',
    price: '$30',
    cadence: '/ class',
    bullets: ['Booking access only'],
  },
];

export function MembershipsScreen({ visible, onClose }: Props) {
  const { tier, daysLeftInTrial, becomeMember, selectInPersonPlan } = useMembership();

  if (!visible) return null;

  const chooseOnline = (plan: OnlinePlan) => {
    showAlert(`Confirm ${plan.name}?`, `${plan.price}${plan.cadence} — this is a preview, no charge yet.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => becomeMember() },
    ]);
  };

  const chooseInPerson = (plan: InPerson) => {
    showAlert(`Confirm ${plan.name}?`, `${plan.price}${plan.cadence} — this is a preview, no charge yet.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => selectInPersonPlan(plan.key) },
    ]);
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="MEMBERSHIPS" onBack={onClose} backTestID="close-memberships" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {tier === 'trial' && daysLeftInTrial !== null && (
          <Text style={styles.trialLine}>
            {daysLeftInTrial} day{daysLeftInTrial === 1 ? '' : 's'} left in your trial
          </Text>
        )}

        <Text style={styles.sectionHeading}>ONLINE PLANS</Text>
        <View style={styles.plans}>
          {ONLINE_PLANS.map((plan) => (
            <View key={plan.key} style={styles.planCard}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
              </View>
              <View style={styles.planBody}>
                <Text style={styles.planPrice}>
                  {plan.price}
                  <Text style={styles.planCadence}>{plan.cadence}</Text>
                </Text>
                {plan.note && <Text style={styles.planNote}>{plan.note}</Text>}
                <Pressable
                  style={styles.selectButton}
                  onPress={() => chooseOnline(plan)}
                  testID={`select-online-${plan.key}`}
                >
                  <Text style={styles.selectButtonText}>CHOOSE {plan.name}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>IN-PERSON PLANS</Text>
        <View style={styles.plans}>
          {IN_PERSON_PLANS.map((plan) => (
            <View key={plan.key} style={[styles.planCard, plan.bestValue && styles.planCardBest]}>
              {plan.bestValue && (
                <View style={styles.bestValueBadge}>
                  <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
                </View>
              )}
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
              </View>
              <View style={styles.planBody}>
                <Text style={styles.planPrice}>
                  {plan.price}
                  <Text style={styles.planCadence}>{plan.cadence}</Text>
                </Text>

                {plan.bullets.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <Ionicons name="checkmark" size={14} color={colors.green} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}

                <Pressable
                  style={styles.selectButton}
                  onPress={() => chooseInPerson(plan)}
                  testID={`select-in-person-${plan.key}`}
                >
                  <Text style={styles.selectButtonText}>CHOOSE {plan.name}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  trialLine: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginBottom: 16,
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionHeadingSpaced: {
    marginTop: 28,
  },
  plans: {
    gap: 16,
  },
  planCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  planCardBest: {
    borderColor: colors.gold,
    borderWidth: 2,
  },
  bestValueBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 1,
  },
  bestValueBadgeText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  planHeader: {
    backgroundColor: colors.green,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  planName: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 2,
  },
  planBody: {
    padding: 20,
  },
  planPrice: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 36,
    letterSpacing: 1,
  },
  planCadence: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.textMuted,
  },
  planNote: {
    color: colors.gold,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  bulletText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  selectButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  selectButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
