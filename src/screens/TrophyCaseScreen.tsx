import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { BadgeIcon } from '../components/icons/BadgeIcon';
import { BADGE_MAP, BadgeId } from '../data/badges';
import { openDeckStore } from '../lib/links';
import { HUNDRED_DOWN_TARGET, useBadges } from '../context/BadgeContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onVerifyJoker: () => void;
};

const PERMANENT_IDS: BadgeId[] = ['joker', 'day_one_doug', 'hundred_down'];
const WEEKLY_IDS: BadgeId[] = ['on_fire', 'cow_killer', 'the_regular'];

function formatEarnedDate(ts: number): string {
  return new Date(ts)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

export function TrophyCaseScreen({ visible, onClose, onVerifyJoker }: Props) {
  const badges = useBadges();
  const { isAdmin } = useMembership();
  const displayName = useDisplayName();
  const earnedSet = new Set(badges.myBadgeIds);

  if (!visible) return null;

  const permanentStatus = (id: BadgeId): string => {
    switch (id) {
      case 'joker': {
        const grantedAt = badges.getJokerGrantedAt(displayName);
        return badges.jokerEarned && grantedAt ? `EARNED ${formatEarnedDate(grantedAt)}` : 'NOT YET EARNED';
      }
      case 'day_one_doug':
        return badges.dayOneDougEarned && badges.dayOneDougEarnedAt
          ? `EARNED ${formatEarnedDate(badges.dayOneDougEarnedAt)}`
          : 'LOG YOUR FIRST WORKOUT TO EARN THIS';
      case 'hundred_down':
        return badges.hundredDownEarned && badges.hundredDownEarnedAt
          ? `EARNED ${formatEarnedDate(badges.hundredDownEarnedAt)}`
          : `${badges.totalWorkoutsLogged} of ${HUNDRED_DOWN_TARGET} workouts`;
      default:
        return '';
    }
  };

  const weeklyStatus = (id: BadgeId): string => {
    switch (id) {
      case 'on_fire':
        return `${badges.onFireProgress.count} of ${badges.onFireProgress.target} WODs this week`;
      case 'cow_killer':
        return badges.cowKillerEarned ? 'EARNED THIS WEEK' : 'NOT YET THIS WEEK';
      case 'the_regular':
        return `${badges.regularProgress.count} of ${badges.regularProgress.target} results posted this week`;
      default:
        return '';
    }
  };

  const renderCard = (id: BadgeId, status: string) => {
    const def = BADGE_MAP[id];
    const earned = earnedSet.has(id);
    return (
      <View key={id} style={styles.card} testID={`trophy-case-badge-${id}`}>
        <View style={styles.cardTopRow}>
          <BadgeIcon id={id} earned={earned} size={48} />
          <View style={styles.cardMain}>
            <Text style={styles.cardName}>{def.name}</Text>
            <Text style={styles.cardDescription}>{def.description}</Text>
            <Text style={[styles.cardStatus, earned && styles.cardStatusEarned]}>{status}</Text>
          </View>
        </View>

        {id === 'joker' && (
          <View style={styles.jokerButtonRow}>
            <Pressable style={styles.verifyButton} onPress={onVerifyJoker} testID="verify-ownership-button">
              <Text style={styles.verifyButtonText}>VERIFY OWNERSHIP</Text>
            </Pressable>
            <Pressable style={styles.getDeckButton} onPress={openDeckStore} testID="get-the-deck-button">
              <Text style={styles.getDeckButtonText}>GET THE DECK</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="THE TROPHY CASE" onBack={onClose} backTestID="close-trophy-case" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>THE TROPHY CASE</Text>
        <Text style={styles.subtitle}>Six badges. Earn them, wear them.</Text>

        <Text style={styles.sectionHeading}>PERMANENT</Text>
        {PERMANENT_IDS.map((id) => renderCard(id, permanentStatus(id)))}

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>THIS WEEK</Text>
        <Text style={styles.sectionNote}>Weekly badges reset every Monday.</Text>
        {WEEKLY_IDS.map((id) => renderCard(id, weeklyStatus(id)))}

        {isAdmin && (
          <Pressable
            style={styles.devRecapButton}
            onPress={badges.previewMonthlyRecap}
            testID="preview-monthly-recap"
          >
            <Text style={styles.devRecapButtonText}>PREVIEW THIS MONTH'S RECAP (DEV)</Text>
          </Pressable>
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
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 30,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 3,
    marginBottom: 22,
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionHeadingSpaced: {
    marginTop: 28,
  },
  sectionNote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginBottom: 14,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  cardMain: {
    flex: 1,
  },
  cardName: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  cardDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  cardStatus: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  cardStatusEarned: {
    color: colors.gold,
  },
  jokerButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  verifyButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  getDeckButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  getDeckButtonText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  devRecapButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
  },
  devRecapButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
});
