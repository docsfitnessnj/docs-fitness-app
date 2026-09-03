import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PostAuthorBadges } from './PostAuthorBadges';
import { useClassSignUp } from '../context/ClassSignUpContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { openFullSchedule } from '../lib/scheduleModal';
import { openMemberships } from '../lib/membershipsModal';
import { colors, fonts } from '../theme';

// Pure display language layered on top of the existing access model — no
// new status concept, no new access rule. membership.fullContentAccess
// already IS the crew/dockside line (trial, online_paid, founding_50,
// in_person_unlimited, admin get it; online_free, ten_pack, drop_in don't),
// so this just reads that existing flag and gives it a name. There's no
// anonymous/guest state — everyone Dockside got there with an email.

type DocksideVariant = 'first_time' | 'free_tier' | 'ten_pack' | 'drop_in';

// "First time visitor" isn't its own tier — it's the same online_free tier
// as the plain free-tier variant, told apart only by whether this account
// has ever actually trained here (started a trial) or booked/attended a
// class. That's deliberate: someone who lands from Instagram to book a
// class shouldn't see a membership pitch before they've ever set foot at
// the boathouse — see membership.hasEverTrialed and the bookingEvents log
// below, which (unlike the live signUps map) keeps every booking ever made
// even after it's later cancelled.
function useDocksideVariant(): DocksideVariant {
  const { tier, hasEverTrialed } = useMembership();
  const displayName = useDisplayName();
  const { bookingEvents } = useClassSignUp();

  const hasEverBooked = bookingEvents.some((event) => event.type === 'booked' && event.memberName === displayName);

  if (!hasEverTrialed && !hasEverBooked) return 'first_time';
  if (tier === 'ten_pack') return 'ten_pack';
  if (tier === 'drop_in') return 'drop_in';
  return 'free_tier';
}

export function StatusBanner() {
  const { fullContentAccess, tenPackClassesRemaining } = useMembership();
  const displayName = useDisplayName();
  const docksideVariant = useDocksideVariant();

  if (fullContentAccess) {
    return (
      <View style={[styles.card, styles.crewCard]}>
        <Ionicons name="boat-outline" size={20} color={colors.green} />
        <View style={styles.textCol}>
          <Text style={styles.crewTitle}>YOU'RE PART OF THE CREW</Text>
          <Text style={styles.crewSubtitle}>FULL ACCESS</Text>
        </View>
        <View style={styles.badgesWrap}>
          {/* Day One Doug assumes a first workout already logged, which
              isn't true for someone who just joined — hidden from the
              banner only; it still earns and shows normally everywhere
              else (Trophy Case, profile, posts/comments). */}
          <PostAuthorBadges author={displayName} exclude={['day_one_doug']} />
        </View>
      </View>
    );
  }

  const isFirstTime = docksideVariant === 'first_time';
  const subtitle =
    docksideVariant === 'first_time'
      ? "YOUR FIRST CLASS AT DOC'S FITNESS IS FREE"
      : docksideVariant === 'ten_pack'
        ? `CLASS BOOKING · ${tenPackClassesRemaining ?? 0} CLASSES LEFT · NO DOC'S WODS`
        : docksideVariant === 'drop_in'
          ? 'CLASS BOOKING ONLY · NO DOC\'S WODS'
          : "ONLY 2 DOC'S WODS A WEEK + COMMUNITY";

  return (
    <View style={styles.docksideWrap}>
      <View style={[styles.card, styles.docksideCard]}>
        <Ionicons name="help-buoy-outline" size={20} color={colors.textMuted} />
        <View style={styles.textCol}>
          <Text style={styles.docksideTitle}>YOU'RE DOCKSIDE</Text>
          <Text style={styles.docksideSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {isFirstTime ? (
        <Pressable style={styles.joinButton} onPress={openFullSchedule} testID="status-banner-see-schedule">
          <Text style={styles.joinButtonText}>SEE SCHEDULE</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.joinButton} onPress={() => openMemberships('unlock')} testID="status-banner-join-crew">
          <Text style={styles.joinButtonText}>JOIN THE CREW — GET FULL ACCESS TO THE APP</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  docksideWrap: {
    marginBottom: 16,
  },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  docksideCard: {
    backgroundColor: colors.card,
    borderColor: colors.hairline,
    marginBottom: 10,
  },
  crewCard: {
    backgroundColor: colors.card,
    borderColor: colors.green,
    marginBottom: 16,
  },
  textCol: {
    flexShrink: 0,
  },
  docksideTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  docksideSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  crewTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  crewSubtitle: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  badgesWrap: {
    marginLeft: 'auto',
  },
  // No fixed/max height and no numberOfLines — the longer "JOIN THE CREW —
  // GET FULL ACCESS TO THE APP" label wraps to a second line at phone width
  // instead of the button ever shrinking its type to fit one line.
  joinButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  joinButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
