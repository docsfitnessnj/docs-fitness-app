import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsHorizontalLockup } from '../components/brand/DocsHorizontalLockup';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onSelectPlan: () => void;
};

type Plan = {
  key: string;
  name: string;
  price: string;
  cadence: string;
  note?: string;
};

const PLANS: Plan[] = [
  { key: 'monthly', name: 'MONTHLY', price: '$37', cadence: '/ month' },
  { key: 'annual', name: 'ANNUAL', price: '$333', cadence: '/ year', note: '12 MONTHS. PAY FOR 9.' },
];

export default function PricingScreen({ onBack, onSelectPlan }: Props) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <Text style={styles.title}>BECOME A MEMBER</Text>
      <Text style={styles.subtext}>Full access to Doc's WODs, COWS, The Deck, and Community.</Text>

      <View style={styles.plans}>
        {PLANS.map((plan) => (
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
                onPress={() => {
                  onSelectPlan();
                  showAlert('Payments Coming Soon', 'This is a preview — no charge yet.');
                }}
              >
                <Text style={styles.selectButtonText}>CHOOSE {plan.name}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <DocsHorizontalLockup width={130} />
      </View>
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
    marginBottom: 28,
    lineHeight: 22,
  },
  plans: {
    gap: 16,
  },
  footer: {
    alignItems: 'center',
    marginTop: 28,
  },
  planCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
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
    fontSize: 40,
    letterSpacing: 1,
  },
  planCadence: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.textMuted,
  },
  planNote: {
    color: colors.gold,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  selectButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  selectButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
