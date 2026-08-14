import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AppModal } from './AppModal';
import { Avatar } from './Avatar';
import { useDeckProgress } from '../context/DeckProgressContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import { openMerchStore } from '../lib/links';
import { showAlert } from '../lib/alert';
import { openFullSchedule } from '../lib/scheduleModal';
import { colors, fonts, TAGLINE } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  photoUri: string | null;
  onOpenProfile: () => void;
  onOpenMyWorkouts: () => void;
  onOpenCloseFriends: () => void;
  onOpenMessages: () => void;
};

type Row = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  meta?: string;
  onPress: () => void;
};

export function SidebarDrawer({
  visible,
  onClose,
  displayName,
  photoUri,
  onOpenProfile,
  onOpenMyWorkouts,
  onOpenCloseFriends,
  onOpenMessages,
}: Props) {
  const navigation = useNavigation<any>();
  const { completedWorkouts } = useWorkoutLog();
  const { completedCount, totalCount } = useDeckProgress();

  if (!visible) return null;

  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  const goToTab = (tab: string) => {
    onClose();
    navigation.navigate(tab);
  };

  const rows: Row[] = [
    { key: 'profile', label: 'PROFILE', icon: 'person-circle-outline', onPress: () => go(onOpenProfile) },
    {
      key: 'workouts',
      label: 'MY WORKOUTS',
      icon: 'barbell-outline',
      meta: String(completedWorkouts.length),
      onPress: () => go(onOpenMyWorkouts),
    },
    { key: 'friends', label: 'CLOSE FRIENDS', icon: 'star-outline', onPress: () => go(onOpenCloseFriends) },
    { key: 'cow', label: 'WEEKLY COW', icon: 'trophy-outline', onPress: () => goToTab('DocsCows') },
  ];

  const rowsAfterDivider: Row[] = [
    {
      key: 'deck',
      label: 'DECK OF WODS',
      icon: 'albums-outline',
      meta: `${completedCount}/${totalCount}`,
      onPress: () => goToTab('Deck'),
    },
    { key: 'schedule', label: 'BOATHOUSE SCHEDULE', icon: 'calendar-outline', onPress: () => go(openFullSchedule) },
    { key: 'merch', label: "MERCH STORE", icon: 'bag-handle-outline', onPress: () => go(openMerchStore) },
    { key: 'message', label: 'MESSAGE DOC', icon: 'chatbubble-ellipses-outline', onPress: () => go(onOpenMessages) },
  ];

  const rowsFinal: Row[] = [
    {
      key: 'settings',
      label: 'SETTINGS & NOTIFICATIONS',
      icon: 'settings-outline',
      onPress: () => go(() => showAlert('Settings & Notifications', 'Coming soon.')),
    },
  ];

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Avatar name={displayName} uri={photoUri} size={44} />
          <Text style={styles.displayName}>{displayName}</Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="close-sidebar">
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.rowsWrap}>
          {rows.map((row) => (
            <MenuRow key={row.key} row={row} />
          ))}
          <View style={styles.divider} />
          {rowsAfterDivider.map((row) => (
            <MenuRow key={row.key} row={row} />
          ))}
          <View style={styles.divider} />
          {rowsFinal.map((row) => (
            <MenuRow key={row.key} row={row} />
          ))}
        </View>

        <Text style={styles.tagline}>{TAGLINE.toUpperCase()}</Text>
      </View>
    </AppModal>
  );
}

function MenuRow({ row }: { row: Row }) {
  return (
    <Pressable style={styles.row} onPress={row.onPress} testID={`sidebar-${row.key}`}>
      <Ionicons name={row.icon} size={20} color={colors.white} />
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
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  displayName: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 2,
  },
  rowsWrap: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 8,
    marginHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  rowLabel: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 15,
    letterSpacing: 0.8,
    marginLeft: 14,
  },
  rowMeta: {
    color: colors.goldBright,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginRight: 8,
  },
  tagline: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 32,
  },
});
