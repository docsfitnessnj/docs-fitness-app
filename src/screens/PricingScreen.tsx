import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsHorizontalLockup } from '../components/brand/DocsHorizontalLockup';
import { PlanSectionHeader } from '../components/PlanSectionHeader';
import { ONLINE_PLANS, ONLINE_PLAN_BULLETS, ONLINE_SECTION_HEADER } from '../data/plans';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onSelectPlan: () => void;
};

export default function PricingScreen({ onBack, onSelectPlan }: Props) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <PlanSectionHeader title={ONLINE_SECTION_HEADER.title} subtitle={ONLINE_SECTION_HEADER.subtitle} />

      <ScrollView contentContainerStyle={styles.plans} showsVerticalScrollIndicator={false}>
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

              {plan.banner && (
                <View style={styles.banner}>
                  <Text style={styles.bannerTitle}>{plan.banner.title}</Text>
                  <Text style={styles.bannerSubtitle}>{plan.banner.subtitle}</Text>
                </View>
              )}

              <Text style={styles.whatYouGet}>WHAT YOU GET</Text>
              {ONLINE_PLAN_BULLETS.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <Ionicons name="checkmark" size={14} color={colors.green} />
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}

              <Pressable style={styles.selectButton} onPress={onSelectPlan}>
                <Text style={styles.selectButtonText}>CHOOSE {plan.name}</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <DocsHorizontalLockup width={130} />
        </View>
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
  plans: {
    gap: 16,
    paddingBottom: 12,
  },
  footer: {
    alignItems: 'center',
    marginTop: 12,
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
  banner: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  bannerTitle: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  bannerSubtitle: {
    color: colors.greenDeep,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginTop: 2,
  },
  whatYouGet: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
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
    marginTop: 16,
  },
  selectButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
