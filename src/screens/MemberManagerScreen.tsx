import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { BadgeIcon } from '../components/icons/BadgeIcon';
import { BADGE_DEFS } from '../data/badges';
import { MEMBER_ROSTER, RosterMember } from '../data/roster';
import { useBadges } from '../context/BadgeContext';
import { useDisplayName } from '../context/ProfileContext';
import { planLabel, useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// This is how Doc approves a verified physical-deck owner: search the
// roster, open a member, flip THE JOKER on. Structured as a per-member
// manual-grant map in BadgeContext so future manual flags (beyond Joker)
// slot in the same way.
export function MemberManagerScreen({ visible, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RosterMember | null>(null);
  const displayName = useDisplayName();
  const { tier } = useMembership();
  const badges = useBadges();

  if (!visible) return null;

  // The signed-in account is also a searchable "member" — its plan comes
  // from live membership state rather than the static roster.
  const allMembers: RosterMember[] = [
    ...(MEMBER_ROSTER.some((m) => m.name === displayName)
      ? []
      : [{ name: displayName, planLabel: planLabel(tier), demoBadges: [] }]),
    ...MEMBER_ROSTER,
  ];

  const results = query.trim()
    ? allMembers.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()))
    : allMembers;

  if (selected) {
    const memberJoker = badges.getBadgesForAuthor(selected.name).includes('joker');
    const memberPlan = selected.name === displayName ? planLabel(tier) : selected.planLabel;
    return (
      <View style={styles.container}>
        <ModalHeader title={selected.name} onBack={() => setSelected(null)} backTestID="member-detail-back" />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.planLabel}>PLAN</Text>
          <Text style={styles.planValue}>{memberPlan}</Text>

          <Text style={[styles.planLabel, styles.badgesLabel]}>BADGES</Text>
          <View style={styles.badgeGrid}>
            {BADGE_DEFS.map((def) => {
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
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search members by name"
          placeholderTextColor={colors.textMuted}
          testID="member-search-input"
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {results.map((m) => (
          <Pressable
            key={m.name}
            style={styles.memberRow}
            onPress={() => setSelected(m)}
            testID={`member-row-${m.name}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{m.name}</Text>
              <Text style={styles.memberPlan}>{m.name === displayName ? planLabel(tier) : m.planLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        ))}
        {results.length === 0 && <Text style={styles.emptyText}>No members match "{query}".</Text>}
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  memberName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  memberPlan: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 12,
    marginTop: 2,
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
    marginBottom: 8,
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
