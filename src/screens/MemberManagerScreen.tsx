import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { BadgeIcon } from '../components/icons/BadgeIcon';
import { visibleBadgeDefs } from '../data/badges';
import { MEMBER_ROSTER, PLAN_SECTIONS, PlanKey, RosterMember, planKeyLabel } from '../data/roster';
import { useBadges } from '../context/BadgeContext';
import { useFoundingFifty } from '../context/FoundingFiftyContext';
import { useDisplayName } from '../context/ProfileContext';
import { MembershipTier, planLabel, useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Maps the live signed-in account's membership tier onto the same plan
// buckets the static roster uses, so the current member slots into the
// grouped list next to everyone else. Tiers with no paid-plan equivalent
// (admin, guest, expired free) are excluded from the roster entirely.
function tierToPlanKey(tier: MembershipTier): PlanKey | undefined {
  switch (tier) {
    case 'in_person_unlimited':
      return 'monthly_unlimited';
    case 'ten_pack':
      return 'ten_pack';
    case 'drop_in':
      return 'drop_in';
    case 'trial':
      return 'trial';
    // The app doesn't yet distinguish monthly vs. annual online billing —
    // every online_paid account is bucketed as Monthly until that's tracked.
    case 'online_paid':
      return 'monthly_online';
    default:
      return undefined;
  }
}

// This is how Doc approves a verified physical-deck owner: search the
// roster, open a member, flip THE JOKER on. Structured as a per-member
// manual-grant map in BadgeContext so future manual flags (beyond Joker)
// slot in the same way.
export function MemberManagerScreen({ visible, onClose }: Props) {
  const [selected, setSelected] = useState<RosterMember | null>(null);
  const displayName = useDisplayName();
  const membership = useMembership();
  const badges = useBadges();
  const founding50 = useFoundingFifty();

  if (!visible) return null;

  const myPlanKey = tierToPlanKey(membership.tier);
  const myEntry: RosterMember | null =
    myPlanKey && !MEMBER_ROSTER.some((m) => m.name === displayName)
      ? {
          name: displayName,
          planKey: myPlanKey,
          joinDate: 'THIS DEVICE',
          classesRemaining: myPlanKey === 'ten_pack' ? membership.tenPackClassesRemaining ?? undefined : undefined,
          daysRemaining: myPlanKey === 'trial' ? membership.daysLeftInTrial ?? undefined : undefined,
          demoBadges: [],
        }
      : null;

  const allMembers: RosterMember[] = [...(myEntry ? [myEntry] : []), ...MEMBER_ROSTER];

  const membersForPlan = (key: PlanKey) => allMembers.filter((m) => m.planKey === key);

  if (selected) {
    const memberJoker = badges.getBadgesForAuthor(selected.name).includes('joker');
    const memberPlan = selected.planKey ? planKeyLabel(selected.planKey) : planLabel(membership.tier);
    return (
      <View style={styles.container}>
        <ModalHeader title={selected.name} onBack={() => setSelected(null)} backTestID="member-detail-back" />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.planLabel}>PLAN</Text>
          <Text style={styles.planValue}>{memberPlan}</Text>
          <Text style={styles.joinDate}>MEMBER SINCE {selected.joinDate}</Text>

          <Text style={[styles.planLabel, styles.badgesLabel]}>BADGES</Text>
          <View style={styles.badgeGrid}>
            {visibleBadgeDefs(founding50.enabled || badges.getBadgesForAuthor(selected.name).includes('founding_50')).map((def) => {
              const earned = badges.getBadgesForAuthor(selected.name).includes(def.id);
              return (
                <View key={def.id} style={styles.badgeCell}>
                  <BadgeIcon id={def.id} earned={earned} size={44} />
                  <Text style={styles.badgeCellLabel} numberOfLines={2}>
                    {def.name}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.grantRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.grantTitle}>THE JOKER</Text>
              <Text style={styles.grantSubtext}>Verified physical Deck of WODs owner.</Text>
            </View>
            <Pressable
              style={[styles.grantButton, memberJoker && styles.revokeButton]}
              onPress={() => (memberJoker ? badges.revokeJoker(selected.name) : badges.grantJoker(selected.name))}
              testID={memberJoker ? 'revoke-joker-button' : 'grant-joker-button'}
            >
              <Text style={[styles.grantButtonText, memberJoker && styles.revokeButtonText]}>
                {memberJoker ? 'REVOKE' : 'GRANT'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ModalHeader title="MEMBER MANAGER" onBack={onClose} backTestID="close-member-manager" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {PLAN_SECTIONS.map(({ section, plans }) => (
          <View key={section} style={styles.section}>
            <Text style={styles.sectionHeading}>{section}</Text>
            {plans.map((plan) => {
              const members = membersForPlan(plan.key);
              return (
                <View key={plan.key} style={styles.planGroup}>
                  <View style={styles.planGroupHeader}>
                    <Text style={styles.planGroupTitle}>{plan.label}</Text>
                    <Text style={styles.planGroupCount}>{members.length}</Text>
                  </View>
                  {members.length === 0 ? (
                    <Text style={styles.emptyPlanText}>No members on this plan.</Text>
                  ) : (
                    members.map((m) => {
                      const earnedIds = new Set(badges.getBadgesForAuthor(m.name));
                      return (
                        <Pressable
                          key={m.name}
                          style={styles.memberRow}
                          onPress={() => setSelected(m)}
                          testID={`member-row-${m.name}`}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberName}>{m.name}</Text>
                            <Text style={styles.memberMeta}>
                              JOINED {m.joinDate}
                              {plan.key === 'ten_pack' && m.classesRemaining != null
                                ? ` · ${m.classesRemaining} CLASSES LEFT`
                                : ''}
                              {plan.key === 'trial' && m.daysRemaining != null ? ` · ${m.daysRemaining} DAYS LEFT` : ''}
                            </Text>
                            <View style={styles.miniBadgeRow}>
                              {visibleBadgeDefs(founding50.enabled || earnedIds.has('founding_50')).map((def) => (
                                <BadgeIcon key={def.id} id={def.id} earned={earnedIds.has(def.id)} size={18} />
                              ))}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              );
            })}
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
    paddingTop: 60,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 12,
  },
  planGroup: {
    marginBottom: 18,
  },
  planGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planGroupTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  planGroupCount: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  emptyPlanText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginBottom: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  memberName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  memberMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  miniBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  planLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  planValue: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
  },
  joinDate: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  badgesLabel: {
    marginTop: 20,
    marginBottom: 12,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 18,
  },
  badgeCell: {
    width: 64,
    alignItems: 'center',
  },
  badgeCellLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 9,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 6,
  },
  grantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
  },
  grantTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  grantSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  grantButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  revokeButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  grantButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  revokeButtonText: {
    color: colors.textMuted,
  },
});
