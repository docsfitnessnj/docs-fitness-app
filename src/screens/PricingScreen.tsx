import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsHorizontalLockup } from '../components/brand/DocsHorizontalLockup';
import { PlanSectionHeader } from '../components/PlanSectionHeader';
import { WebScrollScreen } from '../components/WebScrollScreen';
import { FOUNDING_FIFTY_PRICE, useFoundingFifty } from '../context/FoundingFiftyContext';
import {
  FOUNDING_FIFTY_BANNER,
  FOUNDING_NO_TRIAL_SENTENCE,
  FOUNDING_VALUE_LINE,
  ONLINE_PLANS,
  ONLINE_PLAN_BULLETS,
  ONLINE_SECTION_HEADER,
  OnlinePlan,
  foundingDeadlineLabel,
  foundingSpotsLeftLabel,
} from '../data/plans';
import { showAlert } from '../lib/alert';
import { startOnlineCheckout } from '../lib/stripeCheckout';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
};

export default function PricingScreen({ onBack }: Props) {
  const founding50 = useFoundingFifty();
  const [checkoutPendingKey, setCheckoutPendingKey] = useState<string | null>(null);

  // The founding-vs-standard price is decided for real, server-side, inside
  // create-checkout — this only decides which confirmation copy to show,
  // matching whatever the card on screen already says.
  const choosePlan = (plan: OnlinePlan, founding: boolean) => {
    const title = founding ? 'Start Your Founding 50 Checkout?' : `Start Checkout For ${plan.name}?`;
    const body = founding
      ? `You'll go to Stripe to lock in the FOUNDING 50 RATE. ${FOUNDING_NO_TRIAL_SENTENCE} You can cancel anytime.`
      : `You'll go to Stripe to start ${plan.name} with a 14-day free trial. Card required to start; you won't be charged until the trial ends, and you can cancel anytime.`;
    showAlert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: async () => {
          setCheckoutPendingKey(plan.key);
          const { error } = await startOnlineCheckout(plan.key);
          setCheckoutPendingKey(null);
          if (error) showAlert("Couldn't Start Checkout", error);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <PlanSectionHeader title={ONLINE_SECTION_HEADER.title} subtitle={ONLINE_SECTION_HEADER.subtitle} />

      <WebScrollScreen style={styles.scroll} contentContainerStyle={styles.plans} showsVerticalScrollIndicator={false}>
        {ONLINE_PLANS.map((plan) => {
          // Only the Monthly plan ever carries the Founding 50 offer — while
          // it's live, this same card leads with the founding rate instead
          // of a separate card above it, exactly as the annual plan already
          // leads with its own "3 MONTHS FREE" banner.
          const founding = plan.key === 'monthly' && founding50.isLive;
          return (
            <View key={plan.key} style={styles.planCard}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
              </View>
              <View style={styles.planBody}>
                <View style={styles.priceRow}>
                  <Text style={styles.planPrice}>
                    {founding ? `$${FOUNDING_FIFTY_PRICE}` : plan.price}
                    <Text style={styles.planCadence}>{plan.cadence}</Text>
                  </Text>
                  {founding && <Text style={styles.struckPrice}>{plan.price}</Text>}
                </View>

                {founding && (
                  <>
                    <Text style={styles.foundingSpotsLeft} testID="founding-fifty-spots-left">
                      {foundingSpotsLeftLabel(founding50.spotsRemaining)}
                    </Text>
                    {foundingDeadlineLabel(founding50.endsAt) && (
                      <Text style={styles.foundingDeadline} testID="founding-fifty-deadline">
                        {foundingDeadlineLabel(founding50.endsAt)}
                      </Text>
                    )}
                  </>
                )}

                {founding ? (
                  <>
                    <Text style={styles.foundingRateLabel}>{FOUNDING_FIFTY_BANNER.title}</Text>
                    <Text style={styles.foundingRateSentence}>{FOUNDING_FIFTY_BANNER.subtitle}</Text>
                  </>
                ) : (
                  plan.banner && (
                    <View style={styles.banner}>
                      <Text style={styles.bannerTitle}>{plan.banner.title}</Text>
                      <Text style={styles.bannerSubtitle}>{plan.banner.subtitle}</Text>
                    </View>
                  )
                )}

                {founding && <Text style={styles.foundingValueLine}>{FOUNDING_VALUE_LINE}</Text>}

                <Text style={styles.whatYouGet}>WHAT YOU GET</Text>
                {ONLINE_PLAN_BULLETS.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <Ionicons name="checkmark" size={14} color={colors.green} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}

                <Pressable
                  style={styles.selectButton}
                  onPress={() => choosePlan(plan, founding)}
                  disabled={checkoutPendingKey !== null}
                  testID={founding ? 'select-founding-fifty' : `select-online-${plan.key}`}
                >
                  {checkoutPendingKey === plan.key ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.selectButtonText}>{founding ? 'CLAIM YOUR SPOT' : `CHOOSE ${plan.name}`}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}

        <View style={styles.footer}>
          <DocsHorizontalLockup width={130} />
        </View>
      </WebScrollScreen>
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
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
  struckPrice: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 20,
    textDecorationLine: 'line-through',
  },
  foundingSpotsLeft: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  foundingDeadline: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 3,
  },
  foundingRateLabel: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 12,
  },
  foundingRateSentence: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  foundingValueLine: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
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
