import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { DocsBadge } from './brand/DocsBadge';
import { MembershipToggle } from './MembershipToggle';
import { useChallenge } from '../context/ChallengeContext';
import { useDeckProgress } from '../context/DeckProgressContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { useTour } from '../context/TourContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import { openMerchStore, openLocationMaps } from '../lib/links';
import { openMovementVault } from '../lib/movementVaultModal';
import { openFullSchedule } from '../lib/scheduleModal';
import { colors, fonts, TAGLINE, LOCATION } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenMemberships: () => void;
  onOpenMyWorkouts: () => void;
  onOpenCloseFriends: () => void;
  onOpenMessages: () => void;
  onOpenAdminRoster: () => void;
  onOpenSettings: () => void;
  onOpenTrophyCase: () => void;
  onOpenMemberManager: () => void;
  onOpenFoundingFiftyAdmin: () => void;
  onOpenAbout: () => void;
};

type Row = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  meta?: string;
  onPress: () => void;
};

// A focused settings space, not a second navigation — no account row, no
// tab shortcuts. The one nav-shaped exception is "Deck of WODs", carried
// over from before the tab links existed; it still jumps to that tab.
export function SidebarDrawer({
  visible,
  onClose,
  onOpenProfile,
  onOpenMemberships,
  onOpenMyWorkouts,
  onOpenCloseFriends,
  onOpenMessages,
  onOpenAdminRoster,
  onOpenSettings,
  onOpenTrophyCase,
  onOpenMemberManager,
  onOpenFoundingFiftyAdmin,
  onOpenAbout,
}: Props) {
  const navigation = useNavigation<any>();
  const { completedWorkouts } = useWorkoutLog();
  const { completedCount, totalCount, completedAt: deckCompletedAt } = useDeckProgress();
  const { entries: challengeEntries } = useChallenge();
  const displayName = useDisplayName();
  const { isAdmin } = useMembership();
  const tour = useTour();

  const myWorkoutsCount =
    completedWorkouts.length +
    Object.keys(deckCompletedAt).length +
    challengeEntries.filter((e) => e.author === displayName).length;

  const resetTour = () => {
    tour.resetForTesting();
    onClose();
  };

  if (!visible) return null;

  // Rows that open a stacked in-app screen (its own ModalHeader BACK button)
  // stay nested under the open drawer — the drawer never closes, so backing
  // out of the screen reveals the menu list again, not whatever tab was
  // open behind it. Only rows that leave the hamburger flow entirely (an
  // external link, or jumping straight to a tab) close the drawer first.
  const openNested = (fn: () => void) => {
    fn();
  };
  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  const rows: Row[] = [
    { key: 'profile', label: 'PROFILE', icon: 'person-circle-outline', onPress: () => openNested(onOpenProfile) },
    { key: 'memberships', label: 'MEMBERSHIPS', icon: 'card-outline', onPress: () => openNested(onOpenMemberships) },
    {
      key: 'workouts',
      label: 'MY WORKOUTS',
      icon: 'barbell-outline',
      meta: String(myWorkoutsCount),
      onPress: () => openNested(onOpenMyWorkouts),
    },
    { key: 'friends', label: 'CLOSE FRIENDS', icon: 'star-outline', onPress: () => openNested(onOpenCloseFriends) },
    {
      key: 'invite',
      label: 'INVITE A FRIEND',
      icon: 'share-social-outline',
      onPress: () => openNested(onOpenAbout),
    },
    {
      key: 'trophy-case',
      label: 'THE TROPHY CASE',
      icon: 'trophy-outline',
      onPress: () => openNested(onOpenTrophyCase),
    },
    {
      key: 'movement-vault',
      label: 'THE MOVEMENT VAULT',
      icon: 'play-circle-outline',
      onPress: () => openNested(() => openMovementVault()),
    },
    {
      key: 'schedule',
      label: 'BOATHOUSE SCHEDULE',
      icon: 'calendar-outline',
      onPress: () => openNested(openFullSchedule),
    },
    { key: 'merch', label: 'MERCH STORE', icon: 'bag-handle-outline', onPress: () => go(openMerchStore) },
    {
      key: 'message',
      label: 'MESSAGE DOC',
      icon: 'chatbubble-ellipses-outline',
      onPress: () => openNested(onOpenMessages),
    },
    {
      key: 'deck',
      label: 'DECK OF WODS',
      icon: 'albums-outline',
      meta: `${completedCount}/${totalCount}`,
      onPress: () => go(() => navigation.navigate('Deck')),
    },
    ...(isAdmin
      ? [
          {
            key: 'admin-roster',
            label: 'CLASS ROSTER',
            icon: 'clipboard-outline' as const,
            onPress: () => openNested(onOpenAdminRoster),
          },
          {
            key: 'member-manager',
            label: 'MEMBER MANAGER',
            icon: 'people-circle-outline' as const,
            onPress: () => openNested(onOpenMemberManager),
          },
          {
            key: 'founding-fifty-admin',
            label: 'THE FOUNDING 50',
            icon: 'ribbon-outline' as const,
            onPress: () => openNested(onOpenFoundingFiftyAdmin),
          },
        ]
      : []),
    {
      key: 'settings',
      label: 'SETTINGS & NOTIFICATIONS',
      icon: 'settings-outline',
      onPress: () => openNested(onOpenSettings),
    },
  ];

  return (
      <View style={styles.root}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.backRow}>
            <Pressable onPress={onClose} hitSlop={8} style={styles.backButton} testID="close-sidebar">
              <Ionicons name="chevron-back" size={20} color={colors.white} />
              <Text style={styles.backButtonText}>BACK</Text>
            </Pressable>
          </View>

          <View style={styles.badgeWrap}>
            <DocsBadge variant="white" size={104} />
          </View>

          <View>
            {rows.map((row) => (
              <MenuRow key={row.key} row={row} />
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.previewRow}>
            <MembershipToggle />
          </View>

          <Pressable onPress={resetTour} hitSlop={8} style={styles.devResetRow} testID="dev-reset-tour">
            <Text style={styles.devResetText}>RESET SPOTLIGHT TOUR (DEV)</Text>
          </Pressable>

          <Pressable style={styles.locationRow} onPress={openLocationMaps} testID="sidebar-location">
            <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.locationText}>
              {LOCATION.name}, {LOCATION.city}
            </Text>
          </Pressable>

          <Text style={styles.tagline}>{TAGLINE}</Text>
        </View>
      </View>
  );
}

// The icon column matches the header avatar's width (44) so every row's
// label — GUEST/account name up top, PROFILE/MY WORKOUTS/etc below — starts
// at the same left edge instead of the label position depending on whether
// the leading element is a 44px avatar or a 20px icon.
function MenuRow({ row }: { row: Row }) {
  return (
    <Pressable style={styles.row} onPress={row.onPress} testID={`sidebar-${row.key}`}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={row.icon} size={20} color={colors.white} />
      </View>
      <Text style={styles.rowLabel}>{row.label}</Text>
      {row.meta ? <Text style={styles.rowMeta}>{row.meta}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.green,
    paddingTop: 60,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  backRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  backButtonText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  badgeWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  rowIconWrap: {
    width: 44,
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 15,
    letterSpacing: 0.8,
    marginLeft: 12,
  },
  rowMeta: {
    color: colors.goldBright,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginRight: 8,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    paddingTop: 14,
    paddingBottom: 24,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  devResetRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  devResetText: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 32,
    marginBottom: 10,
  },
  locationText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  tagline: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 15,
  },
});
