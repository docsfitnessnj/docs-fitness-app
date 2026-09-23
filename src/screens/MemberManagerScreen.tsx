import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { BadgeIcon } from '../components/icons/BadgeIcon';
import { visibleBadgeDefs } from '../data/badges';
import { useBadges } from '../context/BadgeContext';
import { useFoundingFifty } from '../context/FoundingFiftyContext';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type MemberProfile = {
  id: string;
  displayName: string;
  howTrain: 'online' | 'boathouse' | null;
  createdAt: number;
};

function formatJoinDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// This is how Doc approves a verified physical-deck owner: search for the
// real member's account, open it, flip THE JOKER on. Reads/writes the
// shared `profiles` and `badge_grants` tables — see supabase/setup.sql for
// the admin-only enforcement (a non-admin's grant/revoke call is rejected
// by Row Level Security regardless of what this screen shows).
export function MemberManagerScreen({ visible, onClose }: Props) {
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MemberProfile | null>(null);
  const badges = useBadges();
  const founding50 = useFoundingFifty();

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('profiles')
      .select('id, display_name, how_train, created_at')
      .order('created_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(isBackendUnavailableError(fetchError) ? "Can't load members right now." : fetchError.message);
          setLoading(false);
          return;
        }
        setMembers(
          (data ?? []).map((row) => ({
            id: row.id,
            displayName: row.display_name?.trim() || 'Member',
            howTrain: row.how_train as 'online' | 'boathouse' | null,
            createdAt: new Date(row.created_at).getTime(),
          }))
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

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

  const filtered = members.filter((m) => m.displayName.toLowerCase().includes(query.trim().toLowerCase()));

  if (selected) {
    const memberJoker = badges.getBadgesForAuthor(selected.displayName).includes('joker');
    return (
      <View style={styles.container}>
        <ModalHeader title={selected.displayName} onBack={() => setSelected(null)} backTestID="member-detail-back" />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.planLabel}>HOW THEY TRAIN</Text>
          <Text style={styles.planValue}>
            {selected.howTrain === 'boathouse' ? 'AT THE BOATHOUSE' : selected.howTrain === 'online' ? 'ONLINE' : 'NOT SET YET'}
          </Text>
          <Text style={styles.joinDate}>MEMBER SINCE {formatJoinDate(selected.createdAt)}</Text>

          <Text style={[styles.planLabel, styles.badgesLabel]}>BADGES</Text>
          <View style={styles.badgeGrid}>
            {visibleBadgeDefs(founding50.isLive || badges.getBadgesForAuthor(selected.displayName).includes('founding_50')).map(
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
            </View>
            <Pressable
              style={[styles.grantButton, memberJoker && styles.revokeButton]}
              onPress={() => (memberJoker ? badges.revokeJoker(selected.id) : badges.grantJoker(selected.id))}
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
          placeholder="Search members by name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          aria-label="Search members"
          testID="member-manager-search"
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>No members found.</Text>
        ) : (
          filtered.map((m) => {
            const earnedIds = new Set(badges.getBadgesForAuthor(m.displayName));
            return (
              <Pressable key={m.id} style={styles.memberRow} onPress={() => setSelected(m)} testID={`member-row-${m.displayName}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.displayName}</Text>
                  <Text style={styles.memberMeta}>JOINED {formatJoinDate(m.createdAt)}</Text>
                  <View style={styles.miniBadgeRow}>
                    {visibleBadgeDefs(founding50.isLive || earnedIds.has('founding_50')).map((def) => (
                      <BadgeIcon key={def.id} id={def.id} earned={earnedIds.has(def.id)} size={18} />
                    ))}
                  </View>
                </View>
              </Pressable>
            );
          })
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
