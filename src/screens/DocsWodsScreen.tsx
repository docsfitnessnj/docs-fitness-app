import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts, TAGLINE } from '../theme';

type Wod = {
  day: string;
  title: string;
  rows: string[];
  meta: string;
};

const WEEKLY_WODS: Wod[] = [
  {
    day: 'MONDAY',
    title: 'THE GAUNTLET',
    rows: ['5 ROUNDS', '10 Kettlebell Swings', '10 Goblet Squats', '10 Push-Ups', '200m Run'],
    meta: 'Scale weight as needed. Rest 2 min between rounds.',
  },
  {
    day: 'TUESDAY',
    title: 'IRON TIDE',
    rows: ['4 ROUNDS', '15 KB Snatches (each arm)', '12 Box Step-Ups', '20 Sit-Ups', '400m Run'],
    meta: 'Switch arms each round. Steady pace, no sprinting.',
  },
  {
    day: 'WEDNESDAY',
    title: 'BOARDWALK BURNER',
    rows: ['AMRAP 20', '8 Burpees', '12 KB Deadlifts', '16 Mountain Climbers', '20 Air Squats'],
    meta: 'As many rounds as possible in 20 minutes.',
  },
  {
    day: 'THURSDAY',
    title: 'THE ANCHOR',
    rows: ['3 ROUNDS', '20 KB Swings (heavy)', '15 Push-Ups', '10 Pull-Ups or Rows', '30 Sec Plank'],
    meta: 'Go heavy on swings. Rest as needed between rounds.',
  },
  {
    day: 'FRIDAY',
    title: 'FRIDAY GRIND',
    rows: ['FOR TIME', '50 KB Swings', '40 Sit-Ups', '30 Push-Ups', '20 Goblet Squats', '10 Burpees'],
    meta: 'One clean effort. Log your time.',
  },
];

// Free (expired trial) accounts only get the first N workouts of the week; the rest show locked.
const FREE_TIER_UNLOCKED_DAYS = 2;

function WodRow({ label }: { label: string }) {
  return (
    <View style={styles.wodRow}>
      <View style={styles.bullet} />
      <Text style={styles.wodRowText}>{label}</Text>
    </View>
  );
}

function WodCard({ wod }: { wod: Wod }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{wod.day}</Text>
      <Text style={styles.cardHeadline}>{wod.title}</Text>

      <View style={styles.divider} />

      {wod.rows.map((row) => (
        <WodRow key={row} label={row} />
      ))}

      <View style={styles.divider} />

      <Text style={styles.cardMeta}>{wod.meta}</Text>
    </View>
  );
}

function LockedWodCard({ wod }: { wod: Wod }) {
  return (
    <View style={[styles.card, styles.cardLocked]}>
      <View style={styles.lockedHeader}>
        <Text style={styles.cardLabelLocked}>{wod.day}</Text>
        <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
      </View>
      <Text style={styles.cardHeadlineLocked}>{wod.title}</Text>
      <Text style={styles.lockedNote}>Unlock to see today&apos;s movements.</Text>
    </View>
  );
}

function UpsellBanner() {
  return (
    <View style={styles.upsell}>
      <Text style={styles.upsellHeading}>JOIN THE BOATHOUSE</Text>
      <Text style={styles.upsellSubtext}>
        Daily workouts. The full Deck of WODs. Weekly challenges. Community.
      </Text>
      <Pressable
        style={styles.unlockButton}
        onPress={() => Alert.alert('Unlock Membership', 'Membership purchases are coming soon.')}
      >
        <Text style={styles.unlockButtonText}>UNLOCK EVERYTHING</Text>
      </Pressable>
    </View>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DocsWods() {
  const { hasFullAccess } = useMembership();

  return (
    <View>
      <Text style={styles.tagline}>{TAGLINE}</Text>

      {WEEKLY_WODS.map((wod, index) => {
        const locked = !hasFullAccess && index >= FREE_TIER_UNLOCKED_DAYS;
        return locked ? <LockedWodCard key={wod.day} wod={wod} /> : <WodCard key={wod.day} wod={wod} />;
      })}

      {!hasFullAccess && <UpsellBanner />}

      <View style={styles.statsRow}>
        <StatBox value="0" label="STREAK" />
        <StatBox value="--:--" label="LAST TIME" />
        <StatBox value="0" label="WODS DONE" />
      </View>
    </View>
  );
}

export default function DocsWodsScreen() {
  return (
    <ScreenContainer>
      <DocsWods />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tagline: {
    color: colors.highlight,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 1,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 2,
  },
  cardHeadline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 34,
    letterSpacing: 1,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.locked,
    marginVertical: 14,
  },
  wodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.highlight,
    marginRight: 10,
  },
  wodRowText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
  },
  cardMeta: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  cardLocked: {
    opacity: 0.6,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabelLocked: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 2,
  },
  cardHeadlineLocked: {
    color: colors.textMuted,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 1,
    marginTop: 6,
  },
  lockedNote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 8,
  },
  upsell: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  upsellHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
  },
  upsellSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  unlockButton: {
    backgroundColor: colors.highlight,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  unlockButtonText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 4,
  },
  statValue: {
    color: colors.highlight,
    fontFamily: fonts.headline,
    fontSize: 26,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 2,
  },
});
