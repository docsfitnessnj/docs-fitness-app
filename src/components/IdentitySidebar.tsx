import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsBadge } from './brand/DocsBadge';
import { BadgeIcon } from './icons/BadgeIcon';
import { useBadges } from '../context/BadgeContext';
import { CHALLENGE_TITLE, useChallengeLeaderboard } from '../context/ChallengeContext';
import { useMembership } from '../context/MembershipContext';
import { BADGE_MAP, WEEKLY_DISPLAY_ORDER } from '../data/badges';
import { formatDateKey, isSameDay } from '../data/content';
import { findNextClass } from '../data/schedule';
import { openMerchStore, openLocationMaps } from '../lib/links';
import { useClassBooking } from '../lib/useClassBooking';
import { navigateToTab } from '../lib/navigationRef';
import { openMemberships } from '../lib/membershipsModal';
import { colors, fonts, TAGLINE, LOCATION } from '../theme';

const MEMBER_COUNT = 128;

type Props = {
  onOpenMessages: () => void;
};

function ChallengeModule() {
  const leaderboard = useChallengeLeaderboard();
  const top3 = leaderboard.slice(0, 3);

  return (
    <Pressable style={styles.card} onPress={() => navigateToTab('DocsCows')} testID="sidebar-challenge-module">
      <View style={styles.cardHeaderRow}>
        <Ionicons name="flame" size={13} color={colors.gold} />
        <Text style={styles.cardHeading}>THIS WEEK'S CHALLENGE</Text>
      </View>
      <Text style={styles.challengeTitle}>{CHALLENGE_TITLE}</Text>
      <View style={styles.leaderboard}>
        {top3.map((entry) => (
          <View key={entry.rank} style={styles.leaderRow}>
            <Text style={styles.leaderRank}>{entry.rank}</Text>
            <Text style={styles.leaderName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.leaderTime}>{entry.time}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.cardLink}>SEE FULL LEADERBOARD</Text>
    </Pressable>
  );
}

function NextClassModule() {
  const { isSignedUp, handleSignUp } = useClassBooking();
  const next = findNextClass(new Date());
  if (!next) return null;

  const { date, row } = next;
  const dateKey = formatDateKey(date);
  const weekdayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayLabel = isSameDay(date, new Date()) ? 'TODAY' : isSameDay(date, tomorrow) ? 'TOMORROW' : weekdayName.toUpperCase();
  const signedUp = isSignedUp(dateKey, row.id);

  return (
    <View style={styles.card} testID="sidebar-next-class-module">
      <Text style={styles.cardHeading}>NEXT CLASS</Text>
      <Text style={styles.nextClassWhen}>
        {dayLabel} · {row.time}
      </Text>
      <Text style={styles.nextClassName}>{row.className}</Text>

      {signedUp ? (
        <View style={styles.signedUpBadge}>
          <Ionicons name="checkmark-circle" size={14} color={colors.green} />
          <Text style={styles.signedUpText}>YOU'RE IN</Text>
        </View>
      ) : (
        <Pressable
          style={styles.signUpButton}
          onPress={() => handleSignUp(row, dateKey, weekdayName)}
          testID="sidebar-next-class-signup"
        >
          <Text style={styles.signUpButtonText}>SIGN UP</Text>
        </Pressable>
      )}
    </View>
  );
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function YourWeekModule() {
  const badges = useBadges();
  const earnedWeekly = WEEKLY_DISPLAY_ORDER.filter((id) => badges.myBadgeIds.includes(id));

  const candidates: { remaining: number; label: string }[] = [];
  if (!badges.onFireProgress.earned) {
    const remaining = badges.onFireProgress.target - badges.onFireProgress.count;
    candidates.push({ remaining, label: `${pluralize(remaining, 'more WOD')} this week for ON FIRE` });
  }
  if (!badges.regularProgress.earned) {
    const remaining = badges.regularProgress.target - badges.regularProgress.count;
    candidates.push({ remaining, label: `${pluralize(remaining, 'more result')} posted for THE REGULAR` });
  }
  if (!badges.cowKillerEarned) {
    candidates.push({ remaining: 1, label: 'Post a score this week for COW KILLER' });
  }
  candidates.sort((a, b) => a.remaining - b.remaining);
  const closest = candidates[0];

  return (
    <View style={styles.card} testID="sidebar-your-week-module">
      <Text style={styles.cardHeading}>YOUR WEEK</Text>
      <Text style={styles.wodProgress}>
        {badges.onFireProgress.count} of {badges.onFireProgress.target} WODs done
      </Text>

      {earnedWeekly.length > 0 && (
        <View style={styles.earnedBadgeRow}>
          {earnedWeekly.map((id) => (
            <View key={id} style={styles.earnedBadgeCell}>
              <BadgeIcon id={id} earned size={30} />
              <Text style={styles.earnedBadgeLabel} numberOfLines={1}>
                {BADGE_MAP[id].name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.closestBadgeText}>
        {closest ? closest.label : 'All 3 weekly badges earned this week. Nice.'}
      </Text>
    </View>
  );
}

function JoinPromptModule() {
  return (
    <View style={styles.card} testID="sidebar-join-prompt">
      <Text style={styles.cardHeading}>JOIN THE BOATHOUSE</Text>
      <Text style={styles.joinPromptText}>
        Unlock every WOD, the full Deck of WODs, the Weekly Challenge, and the Trophy Case.
      </Text>
      <Pressable style={styles.joinButton} onPress={() => openMemberships('unlock')} testID="sidebar-join-button">
        <Text style={styles.joinButtonText}>SEE MEMBERSHIPS</Text>
      </Pressable>
    </View>
  );
}

function FooterModule({ onOpenMessages }: { onOpenMessages: () => void }) {
  return (
    <View style={styles.footerCard}>
      <View style={styles.brandMark}>
        <DocsBadge variant="white" size={64} />
      </View>
      <Text style={styles.name}>DOC'S FITNESS</Text>
      <Text style={styles.tagline}>{TAGLINE}</Text>

      <View style={styles.memberRow}>
        <Ionicons name="people-outline" size={14} color={colors.green} />
        <Text style={styles.memberCount}>{MEMBER_COUNT} MEMBERS</Text>
      </View>

      <View style={styles.divider} />

      <Pressable style={styles.linkRow} onPress={onOpenMessages}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.green} />
        <Text style={styles.linkText}>Message Doc</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={openMerchStore}>
        <Ionicons name="bag-handle-outline" size={16} color={colors.green} />
        <Text style={styles.linkText}>Doc's Merch Store</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={openLocationMaps}>
        <Ionicons name="location-outline" size={16} color={colors.green} />
        <Text style={styles.linkText}>
          {LOCATION.name}, {LOCATION.city}
        </Text>
      </Pressable>
    </View>
  );
}

export function IdentitySidebar({ onOpenMessages }: Props) {
  const { fullContentAccess } = useMembership();

  return (
    <View>
      <ChallengeModule />
      <NextClassModule />
      {fullContentAccess ? <YourWeekModule /> : <JoinPromptModule />}
      <FooterModule onOpenMessages={onOpenMessages} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 18,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  cardHeading: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  challengeTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 10,
  },
  leaderboard: {
    gap: 6,
    marginBottom: 10,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leaderRank: {
    width: 16,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  leaderName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  leaderTime: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  cardLink: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  nextClassWhen: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  nextClassName: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 12,
  },
  signUpButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.green,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  signUpButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  signedUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
  },
  signedUpText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  wodProgress: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  earnedBadgeRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
  },
  earnedBadgeCell: {
    alignItems: 'center',
    width: 54,
  },
  earnedBadgeLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 9,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 4,
  },
  closestBadgeText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
  },
  joinPromptText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 14,
  },
  joinButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  joinButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  footerCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 20,
    alignItems: 'center',
  },
  brandMark: {
    marginBottom: 10,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 15,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  memberCount: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.hairline,
    marginVertical: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    paddingVertical: 8,
  },
  linkText: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
});
