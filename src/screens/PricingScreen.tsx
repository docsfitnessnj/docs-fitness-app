import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsHorizontalLockup } from '../components/brand/DocsHorizontalLockup';
import { PlanSectionHeader } from '../components/PlanSectionHeader';
import { WebScrollScreen } from '../components/WebScrollScreen';
import { FOUNDING_FIFTY_PRICE, useFoundingFifty } from '../context/FoundingFiftyContext';
import { ONLINE_PLANS, ONLINE_PLAN_BULLETS, ONLINE_SECTION_HEADER } from '../data/plans';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onSelectPlan: () => void;
  onSelectFoundingFifty: () => void;
};

export default function PricingScreen({ onBack, onSelectPlan, onSelectFoundingFifty }: Props) {
  const founding50 = useFoundingFifty();

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
          const displayBanner = founding
            ? { title: 'FOUNDING 50 RATE', subtitle: `$${FOUNDING_FIFTY_PRICE} a month, locked in for as long as your membership stays active.` }
            : plan.banner;
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
                  <Text style={styles.foundingCounter} testID="founding-fifty-counter">
                    {founding50.claimedCount} of {founding50.capacity} spots claimed
                  </Text>
                )}

                {displayBanner && (
                  <View style={styles.banner}>
                    <Text style={styles.bannerTitle}>{displayBanner.title}</Text>
                    <Text style={styles.bannerSubtitle}>{displayBanner.subtitle}</Text>
                  </View>
                )}

                <Text style={styles.whatYouGet}>WHAT YOU GET</Text>
                {ONLINE_PLAN_BULLETS.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <Ionicons name="checkmark" size={14} color={colors.green} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}

                <Pressable
                  style={styles.selectButton}
                  onPress={founding ? onSelectFoundingFifty : onSelectPlan}
                  testID={founding ? 'select-founding-fifty' : undefined}
                >
                  <Text style={styles.selectButtonText}>{founding ? 'CLAIM YOUR SPOT' : `CHOOSE ${plan.name}`}</Text>
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
  foundingCounter: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginTop: 8,
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
