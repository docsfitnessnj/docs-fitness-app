import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppPressable } from './AppPressable';
import { DocsBadge } from './brand/DocsBadge';
import { UnreadCountBadge } from './UnreadCountBadge';
import { useGroupChatUnread } from '../context/GroupChatUnreadContext';
import { colors, fonts } from '../theme';

type Props = {
  subtitle?: string;
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
  // Only passed in on the Community tab — every other tab leaves this
  // undefined and the icon simply doesn't render. Opens the same DOC'S
  // GROUP CHAT screen as the hamburger drawer row and the desktop sidebar.
  onOpenGroupChat?: () => void;
};

export function AppTopBar({ subtitle, onOpenSidebar, onOpenSearch, onOpenGroupChat }: Props) {
  const { unreadCount } = useGroupChatUnread();
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.bar}>
        <AppPressable onPress={onOpenSidebar} hitSlop={8} style={styles.iconButton} testID="open-sidebar">
          <Ionicons name="menu-outline" size={24} color={colors.text} />
        </AppPressable>

        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <DocsBadge variant="white" size={22} />
            <Text style={styles.title}>DOC'S FITNESS</Text>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.rightGroup}>
          {onOpenGroupChat && (
            <AppPressable onPress={onOpenGroupChat} hitSlop={8} style={styles.iconButton} testID="open-group-chat">
              <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
              <UnreadCountBadge count={unreadCount} style={styles.groupChatBadge} />
            </AppPressable>
          )}
          <AppPressable onPress={onOpenSearch} hitSlop={8} style={styles.iconButton} testID="open-search">
            <Ionicons name="search-outline" size={22} color={colors.text} />
          </AppPressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.card,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  iconButton: {
    padding: 4,
    width: 32,
    alignItems: 'center',
  },
  groupChatBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.8,
  },
  subtitle: {
    color: colors.gold,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 1,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
