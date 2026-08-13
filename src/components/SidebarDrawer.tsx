import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { Avatar } from './Avatar';
import { openMerchStore } from '../lib/links';
import { colors, fonts } from '../theme';

const DRAWER_WIDTH = 280;

type Props = {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  photoUri: string | null;
  onOpenProfile: () => void;
  onOpenMyWorkouts: () => void;
  onOpenCloseFriends: () => void;
};

type Row = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
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
}: Props) {
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(translateX, { toValue: 0, duration: 240, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }).start(() => {
        setMounted(false);
      });
    }
  }, [visible, mounted, translateX]);

  if (!mounted) return null;

  const openMerch = () => {
    onClose();
    openMerchStore();
  };

  const rows: Row[] = [
    { key: 'profile', label: 'PROFILE', icon: 'person-circle-outline', onPress: () => { onClose(); onOpenProfile(); } },
    { key: 'workouts', label: 'MY WORKOUTS', icon: 'barbell-outline', onPress: () => { onClose(); onOpenMyWorkouts(); } },
    { key: 'merch', label: "DOC'S MERCH STORE", icon: 'bag-handle-outline', onPress: openMerch },
    { key: 'friends', label: 'CLOSE FRIENDS', icon: 'star-outline', onPress: () => { onClose(); onOpenCloseFriends(); } },
  ];

  return (
    <AppModal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
          <View style={styles.header}>
            <Avatar name={displayName} uri={photoUri} size={40} />
            <Text style={styles.displayName}>{displayName}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {rows.map((row) => (
            <Pressable key={row.key} style={styles.row} onPress={row.onPress}>
              <Ionicons name={row.icon} size={20} color={colors.highlight} />
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.background,
    paddingTop: 60,
    borderRightWidth: 1,
    borderRightColor: colors.locked,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  displayName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.locked,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  rowLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    letterSpacing: 0.5,
    marginLeft: 14,
  },
});
