import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  { key: 'annual', name: 'ANNUAL', price: '$333', cadence: '/ year', note: '12 months. Pay for 9.' },
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
            <Text style={styles.planName}>{plan.name}</Text>
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
        ))}
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
    fontFamily: fonts.bodySemiBold,
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
    lineHeight: 20,
  },
  plans: {
    gap: 16,
  },
  planCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
  },
  planName: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 2,
  },
  planPrice: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 40,
    letterSpacing: 1,
    marginTop: 4,
  },
  planCadence: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.textMuted,
  },
  planNote: {
    color: colors.highlight,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  selectButton: {
    backgroundColor: colors.highlight,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  selectButtonText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
