import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InPersonPlan } from '../context/MembershipContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onSelectPlan: (plan: InPersonPlan) => void;
};

type Plan = {
  key: InPersonPlan;
  name: string;
  price: string;
  cadence: string;
  bullets: string[];
  bestValue?: boolean;
};

const PLANS: Plan[] = [
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

export default function InPersonPlansScreen({ onBack, onSelectPlan }: Props) {
  const confirmPlan = (plan: Plan) => {
    showAlert(`Confirm ${plan.name}?`, `${plan.price}${plan.cadence} — this is a preview, no charge yet.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => onSelectPlan(plan.key) },
    ]);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID="in-person-plans-back">
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <Text style={styles.title}>BOATHOUSE PLANS</Text>
      <Text style={styles.subtext}>Train in person at the Boathouse in Ventnor City.</Text>

      <ScrollView contentContainerStyle={styles.plans} showsVerticalScrollIndicator={false}>
        {PLANS.map((plan) => (
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
                onPress={() => confirmPlan(plan)}
                testID={`select-plan-${plan.key}`}
              >
                <Text style={styles.selectButtonText}>CHOOSE {plan.name}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 1,
    marginLeft: 2,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 34,
    letterSpacing: 1,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 22,
  },
  plans: {
    gap: 16,
    paddingBottom: 32,
  },
  planCard: {
    backgroundColor: colors.white,
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
