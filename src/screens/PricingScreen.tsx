import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onSelectPlan: (plan: 'monthly' | 'yearly') => void;
};

// Visual-only pricing — no real payment processing yet. Picking a plan just
// enters the app as a Member.
export default function PricingScreen({ onBack, onSelectPlan }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>BECOME A MEMBER</Text>
        <Text style={styles.subtitle}>Full access. No trial required.</Text>

        <Pressable style={styles.planCard} onPress={() => onSelectPlan('monthly')}>
          <Text style={styles.planLabel}>MONTHLY</Text>
          <Text style={styles.planPrice}>
            $37<Text style={styles.planPeriod}>/month</Text>
          </Text>
          <Text style={styles.planNote}>Cancel anytime.</Text>
        </Pressable>

        <Pressable
          style={[styles.planCard, styles.planCardHighlight]}
          onPress={() => onSelectPlan('yearly')}
        >
          <View style={styles.bestValueBadge}>
            <Text style={styles.bestValueText}>BEST VALUE</Text>
          </View>
          <Text style={styles.planLabel}>ANNUAL</Text>
          <Text style={styles.planPrice}>
            $333<Text style={styles.planPeriod}>/year</Text>
          </Text>
          <Text style={styles.planNote}>12 months. Pay for 9.</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1,
    marginLeft: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 36,
    letterSpacing: 1,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  planCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  planCardHighlight: {
    borderColor: colors.highlight,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: colors.highlight,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bestValueText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  planLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 6,
  },
  planPrice: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 40,
    letterSpacing: 0.5,
  },
  planPeriod: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.textMuted,
  },
  planNote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 6,
  },
});
