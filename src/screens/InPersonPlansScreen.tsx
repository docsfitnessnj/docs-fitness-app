import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InPersonPlan } from '../context/MembershipContext';
import { PlanSectionHeader } from '../components/PlanSectionHeader';
import { WebScrollScreen } from '../components/WebScrollScreen';
import { IN_PERSON_PLANS, IN_PERSON_SECTION_HEADER, InPersonPlanCard } from '../data/plans';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  // Monthly Unlimited / 10 Class Pack: starts real Stripe Checkout and
  // resolves with an error to show, if any, once that attempt finishes.
  // Drop In: there's nothing to check out yet (no class chosen) — this
  // just lets the member into the app on the free tier, the same as the
  // About page's BOOK YOUR CLASS door; they pay $25 per class later, from
  // the booking flow itself.
  onSelectPlan: (plan: InPersonPlan) => Promise<{ error: string | null } | void>;
};

export default function InPersonPlansScreen({ onBack, onSelectPlan }: Props) {
  const [pendingKey, setPendingKey] = useState<InPersonPlan | null>(null);

  const confirmPlan = (plan: InPersonPlanCard) => {
    if (plan.key === 'drop_in') {
      showAlert(
        'Drop In Is Paid Per Class',
        "No charge now — you'll pay $25 right from the class schedule when you book, and your first class at Doc's Fitness is free.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => onSelectPlan(plan.key) },
        ]
      );
      return;
    }
    showAlert(
      `Start Checkout For ${plan.name}?`,
      `You'll go to Stripe to ${plan.key === 'monthly_unlimited' ? 'start' : 'buy'} ${plan.name} — ${plan.price}${plan.cadence}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setPendingKey(plan.key);
            const result = await onSelectPlan(plan.key);
            setPendingKey(null);
            if (result?.error) showAlert("Couldn't Start Checkout", result.error);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container} nativeID="in-person-plans-safe-top">
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID="in-person-plans-back">
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <PlanSectionHeader title={IN_PERSON_SECTION_HEADER.title} subtitle={IN_PERSON_SECTION_HEADER.subtitle} />

      <WebScrollScreen style={styles.scroll} contentContainerStyle={styles.plans} showsVerticalScrollIndicator={false}>
        {IN_PERSON_PLANS.map((plan) => (
          <View key={plan.key} style={[styles.planCard, plan.topBanner && styles.planCardBest]}>
            {plan.topBanner && (
              <View style={styles.topBanner}>
                <Text style={styles.topBannerText}>{plan.topBanner}</Text>
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

              {plan.bulletsHeading && <Text style={styles.bulletsHeading}>{plan.bulletsHeading}</Text>}

              {plan.bullets.map((bullet) => {
                const emphasized = bullet === plan.emphasizedBullet;
                return (
                  <View key={bullet} style={[styles.bulletRow, emphasized && styles.bulletRowEmphasized]}>
                    <Ionicons name="checkmark" size={14} color={emphasized ? colors.gold : colors.green} />
                    <Text style={[styles.bulletText, emphasized && styles.bulletTextEmphasized]}>{bullet}</Text>
                  </View>
                );
              })}

              {plan.clarifyingNote && <Text style={styles.clarifyingNote}>{plan.clarifyingNote}</Text>}

              <Pressable
                style={styles.selectButton}
                onPress={() => confirmPlan(plan)}
                disabled={pendingKey !== null}
                testID={`select-plan-${plan.key}`}
              >
                {pendingKey === plan.key ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.selectButtonText}>CHOOSE {plan.name}</Text>
                )}
              </Pressable>
            </View>
          </View>
        ))}
      </WebScrollScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  // paddingTop here is the ordinary-browser-chrome value; index.html's
  // #in-person-plans-safe-top rule adds the real env(safe-area-inset-top)
  // on top of it in standalone mode -- a single additive source. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  // Passed through to WebScrollScreen — a real ScrollView on native, a
  // plain View on web (see that component for why).
  scroll: {
    flex: 1,
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
  topBanner: {
    backgroundColor: colors.gold,
    paddingVertical: 8,
    alignItems: 'center',
  },
  topBannerText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1.5,
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
  bulletsHeading: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 14,
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
  bulletRowEmphasized: {
    backgroundColor: 'rgba(229,184,11,0.14)',
    borderRadius: 8,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bulletTextEmphasized: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
  },
  clarifyingNote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 10,
    fontStyle: 'italic',
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
