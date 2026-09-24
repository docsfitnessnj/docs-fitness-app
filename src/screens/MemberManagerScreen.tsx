import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { BadgeIcon } from '../components/icons/BadgeIcon';
import { SaveConfirmation } from '../components/SaveConfirmation';
import { visibleBadgeDefs } from '../data/badges';
import { useBadges } from '../context/BadgeContext';
import { useFoundingFifty } from '../context/FoundingFiftyContext';
import { AdminMember, AdminMemberStatusKind, MEMBER_GROUPS, useAdminMembers } from '../lib/useAdminMembers';
import { useSaveConfirmation } from '../lib/useSaveConfirmation';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatJoinDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function statusColor(kind: AdminMemberStatusKind): string {
  switch (kind) {
    case 'trial':
      return colors.gold;
    case 'active':
      return colors.green;
    case 'canceling':
    case 'canceled':
      return colors.scoreboardRed;
    default:
      return colors.textMuted;
  }
}

// This is how Doc approves a verified physical-deck owner: search for the
// real member's account, open it, flip THE JOKER on. Reads/writes the
// shared `profiles` and `badge_grants` tables — see supabase/setup.sql for
// the admin-only enforcement (a non-admin's grant/revoke call is rejected
// by Row Level Security regardless of what this screen shows).
//
// The roster below is grouped by real plan (online: the real Stripe-backed
// subscriptions table via admin_list_members(); in-person: still the
// simulated in_person_plan column — see useAdminMembers) rather than one
// flat list, so Doc can tell at a glance who's paying, trialing, or lapsed.
export function MemberManagerScreen({ visible, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AdminMember | null>(null);
  const { grouped, loading, error } = useAdminMembers(visible);
  const badges = useBadges();
  const founding50 = useFoundingFifty();
  const jokerSaveConfirm = useSaveConfirmation();

  // A stale SAVED/error from a previous member shouldn't linger once Doc
  // moves on to look at someone else.
  useEffect(() => {
    jokerSaveConfirm.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const trimmedQuery = query.trim().toLowerCase();
  const matchesQuery = (m: AdminMember) =>
    !trimmedQuery || m.displayName.toLowerCase().includes(trimmedQuery) || (m.email ?? '').toLowerCase().includes(trimmedQuery);

  const sections = useMemo(
    () =>
      grouped
        .map((g) => ({ ...g, visibleMembers: g.members.filter(matchesQuery) }))
        .filter((g) => (trimmedQuery ? g.visibleMembers.length > 0 : true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grouped, trimmedQuery]
  );

  if (!visible) return null;

  if (loading) {
    return (
      <View style={styles.container}>
        <ModalHeader title="MEMBER MANAGER" onBack={onClose} backTestID="close-member-manager" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ModalHeader title="MEMBER MANAGER" onBack={onClose} backTestID="close-member-manager" />
        <BackendErrorNotice message={error} />
      </View>
    );
  }

  if (selected) {
    const memberJoker = badges.getBadgesForAuthor(selected.displayName).includes('joker');
    const groupTitle = MEMBER_GROUPS.find((g) => g.key === selected.group)?.title ?? 'FREE ACCOUNTS';
    return (
      <View style={styles.container}>
        <ModalHeader title={selected.displayName} onBack={() => setSelected(null)} backTestID="member-detail-back" />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {!!selected.email && <Text style={styles.detailEmail}>{selected.email}</Text>}
          <Text style={[styles.planLabel, { marginTop: 12 }]}>PLAN</Text>
          <View style={styles.planRow}>
            <Text style={styles.planValue}>{groupTitle}</Text>
            {selected.founding && (
              <View style={styles.foundingTag}>
                <Text style={styles.foundingTagText}>FOUNDING</Text>
              </View>
            )}
          </View>
          {!!selected.statusLabel && (
            <Text style={[styles.statusText, { color: statusColor(selected.statusKind) }]}>{selected.statusLabel}</Text>
          )}
          <Text style={styles.joinDate}>MEMBER SINCE {formatJoinDate(selected.createdAt)}</Text>

          <Text style={[styles.planLabel, styles.badgesLabel]}>BADGES</Text>
          <View style={styles.badgeGrid}>
            {visibleBadgeDefs(founding50.isLive || selected.founding || badges.getBadgesForAuthor(selected.displayName).includes('founding_50')).map(
              (def) => {
                const earned = badges.getBadgesForAuthor(selected.displayName).includes(def.id);
                return (
                  <View key={def.id} style={styles.badgeCell}>
                    <BadgeIcon id={def.id} earned={earned} size={44} />
                    <Text style={styles.badgeCellLabel} numberOfLines={2}>
                      {def.name}
                    </Text>
                  </View>
                );
              }
            )}
          </View>

          <View style={styles.grantRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.grantTitle}>THE JOKER</Text>
              <Text style={styles.grantSubtext}>Verified physical Deck of WODs owner.</Text>
              <View style={styles.jokerSaveConfirmWrap}>
                <SaveConfirmation state={jokerSaveConfirm.state} errorMessage={jokerSaveConfirm.errorMessage} />
              </View>
            </View>
            <Pressable
              style={[styles.grantButton, memberJoker && styles.revokeButton]}
              onPress={async () => {
                jokerSaveConfirm.start();
                const { error: grantError } = memberJoker
                  ? await badges.revokeJoker(selected.id)
                  : await badges.grantJoker(selected.id);
                if (grantError) {
                  jokerSaveConfirm.fail(grantError);
                  return;
                }
                jokerSaveConfirm.succeed();
              }}
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
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search members by name or email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          aria-label="Search members"
          testID="member-manager-search"
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {sections.length === 0 ? (
          <Text style={styles.emptyText}>No members found.</Text>
        ) : (
          sections.map((section) => (
            <View key={section.key} style={styles.section} testID={`member-group-${section.key}`}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
                {section.simulated && (
                  <View style={styles.simulatedTag}>
                    <Text style={styles.simulatedTagText}>SIMULATED</Text>
                  </View>
                )}
                <Text style={styles.sectionCount}>{section.members.length}</Text>
              </View>
              {section.visibleMembers.length === 0 ? (
                <Text style={styles.emptySectionText}>No members in this group yet.</Text>
              ) : (
                section.visibleMembers.map((m) => {
                  const earnedIds = new Set(badges.getBadgesForAuthor(m.displayName));
                  return (
                    <Pressable
                      key={m.id}
                      style={styles.memberRow}
                      onPress={() => setSelected(m)}
                      testID={`member-row-${m.displayName}`}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.memberNameRow}>
                          <Text style={styles.memberName}>{m.displayName}</Text>
                          {m.founding && (
                            <View style={styles.foundingTag}>
                              <Text style={styles.foundingTagText}>FOUNDING</Text>
                            </View>
                          )}
                        </View>
                        {!!m.email && (
                          <Text style={styles.memberEmail} numberOfLines={1}>
                            {m.email}
                          </Text>
                        )}
                        <Text style={styles.memberMeta}>JOINED {formatJoinDate(m.createdAt)}</Text>
                        {!!m.statusLabel && (
                          <Text style={[styles.memberStatus, { color: statusColor(m.statusKind) }]}>{m.statusLabel}</Text>
                        )}
                        <View style={styles.miniBadgeRow}>
                          {visibleBadgeDefs(founding50.isLive || m.founding || earnedIds.has('founding_50')).map((def) => (
                            <BadgeIcon key={def.id} id={def.id} earned={earnedIds.has(def.id)} size={18} />
                          ))}
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          ))
        )}
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
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionHeaderText: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  simulatedTag: {
    backgroundColor: colors.hairline,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  simulatedTagText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  sectionCount: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  emptySectionText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 4,
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
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  memberEmail: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  memberMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  memberStatus: {
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  foundingTag: {
    backgroundColor: colors.gold,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  foundingTagText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
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
  detailEmail: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  planLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planValue: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
  },
  statusText: {
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
    marginTop: 4,
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
  jokerSaveConfirmWrap: {
    marginTop: 8,
    alignItems: 'flex-start',
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
