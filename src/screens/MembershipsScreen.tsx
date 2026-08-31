import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { FoundingFiftyCard } from '../components/FoundingFiftyCard';
import { PlanSectionHeader } from '../components/PlanSectionHeader';
import { FOUNDING_FIFTY_PRICE, useFoundingFifty } from '../context/FoundingFiftyContext';
import { MembershipTier, useMembership } from '../context/MembershipContext';
import {
  IN_PERSON_PLANS,
  IN_PERSON_SECTION_HEADER,
  InPersonPlanCard,
  ONLINE_PLANS,
  ONLINE_PLAN_BULLETS,
  ONLINE_SECTION_HEADER,
  OnlinePlan,
} from '../data/plans';
import { showAlert } from '../lib/alert';
import { useClaimFoundingFifty } from '../lib/useClaimFoundingFifty';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  // True whenever this screen was opened from a locked-state prompt (a
  // gated tab, a locked WOD day, a locked story) rather than browsed to
  // directly — narrows the in-person section to Monthly Unlimited, the only
  // in-person plan that unlocks app features, so 10 Class Pack and Drop In
  // (which don't) can't muddy a decision that's specifically about unlocking.
  onlyFullAccess?: boolean;
};

function priceNumber(price: string): number {
  return parseInt(price.replace(/[^0-9]/g, ''), 10) || 0;
}

// The plan card price that corresponds to the account's current tier, so a
// switch confirmation can note the price difference — null for tiers with
// no comparable card price (guest, admin, expired free).
function currentTierPrice(tier: MembershipTier): number | null {
  switch (tier) {
    case 'online_paid':
      return priceNumber(ONLINE_PLANS.find((p) => p.key === 'monthly')!.price);
    case 'founding_50':
      return FOUNDING_FIFTY_PRICE;
    case 'in_person_unlimited':
      return priceNumber(IN_PERSON_PLANS.find((p) => p.key === 'monthly_unlimited')!.price);
    case 'ten_pack':
      return priceNumber(IN_PERSON_PLANS.find((p) => p.key === 'ten_pack')!.price);
    case 'drop_in':
      return priceNumber(IN_PERSON_PLANS.find((p) => p.key === 'drop_in')!.price);
    default:
      return null;
  }
}

function priceDifferenceLine(currentTier: MembershipTier, nextPrice: number): string {
  const current = currentTierPrice(currentTier);
  if (current === null) return '';
  const diff = nextPrice - current;
  if (diff === 0) return ' Same price as your current plan.';
  return diff > 0
    ? ` That's $${diff} more than your current plan.`
    : ` That's $${Math.abs(diff)} less than your current plan.`;
}

export function MembershipsScreen({ visible, onClose, onlyFullAccess = false }: Props) {
  const { tier, daysLeftInTrial, tenPackClassesRemaining, becomeMember, selectInPersonPlan } = useMembership();
  const founding50 = useFoundingFifty();
  const claimFoundingFifty = useClaimFoundingFifty();

  if (!visible) return null;

  const inPersonPlans = onlyFullAccess ? IN_PERSON_PLANS.filter((p) => p.key === 'monthly_unlimited') : IN_PERSON_PLANS;
  const showFoundingFifty = founding50.enabled && !founding50.soldOut;

  const chooseOnline = (plan: OnlinePlan) => {
    showAlert(
      `Confirm Switch To ${plan.name}?`,
      `${plan.price}${plan.cadence} — this is a preview, no charge yet.${priceDifferenceLine(tier, priceNumber(plan.price))}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => becomeMember() },
      ]
    );
  };

  const chooseFoundingFifty = () => {
    showAlert(
      'Confirm THE FOUNDING 50?',
      `$${FOUNDING_FIFTY_PRICE}/month, locked in for as long as you're a member — this is a preview, no charge yet.${priceDifferenceLine(tier, FOUNDING_FIFTY_PRICE)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => claimFoundingFifty() },
      ]
    );
  };

  const chooseInPerson = (plan: InPersonPlanCard) => {
    showAlert(
      `Confirm Switch To ${plan.name}?`,
      `${plan.price}${plan.cadence} — this is a preview, no charge yet.${priceDifferenceLine(tier, priceNumber(plan.price))}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => selectInPersonPlan(plan.key) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ModalHeader
        title={onlyFullAccess ? 'UNLOCK EVERYTHING' : 'MEMBERSHIPS'}
        onBack={onClose}
        backTestID="close-memberships"
      />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {onlyFullAccess && (
          <Text style={styles.unlockIntro}>These plans include full access to the app.</Text>
        )}
        {tier === 'trial' && daysLeftInTrial !== null && (
          <Text style={styles.trialLine}>
            {daysLeftInTrial} day{daysLeftInTrial === 1 ? '' : 's'} left in your trial
          </Text>
        )}

        <PlanSectionHeader title={ONLINE_SECTION_HEADER.title} subtitle={ONLINE_SECTION_HEADER.subtitle} />
        <View style={styles.plans}>
          {showFoundingFifty && (
            <FoundingFiftyCard
              spotsRemaining={founding50.spotsRemaining}
              capacity={founding50.capacity}
              onPress={chooseFoundingFifty}
            />
          )}
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

        <PlanSectionHeader title={IN_PERSON_SECTION_HEADER.title} subtitle={IN_PERSON_SECTION_HEADER.subtitle} spaced />
        <View style={styles.plans}>
          {inPersonPlans.map((plan) => (
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

                {plan.key === 'ten_pack' && tier === 'ten_pack' && (
                  <Text style={styles.classesLeft} testID="ten-pack-classes-left">
                    {tenPackClassesRemaining ?? 0} classes left
                  </Text>
                )}

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
  unlockIntro: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    marginBottom: 16,
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
  classesLeft: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginTop: 6,
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
  bulletsHeading: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 14,
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
