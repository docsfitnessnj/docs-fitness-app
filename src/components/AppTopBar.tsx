import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppPressable } from './AppPressable';
import { KettlewaveMark } from './brand/KettlewaveMark';
import { UnreadCountBadge } from './UnreadCountBadge';
import { useGroupChatUnread } from '../context/GroupChatUnreadContext';
import { colors, fonts } from '../theme';

// Matches the "DOC'S FITNESS" title's own cap height, not the title plus
// subtitle block -- Bebas Neue is a tall condensed all-caps face with
// almost no descenders, so with the title's lineHeight pulled in to match
// its fontSize (stripping the font's default leading), fontSize itself is
// a close read of cap height. Fixed and independent of subtitle text, so
// it never resizes between tabs.
const TITLE_FONT_SIZE = 20;
const TOP_BAR_MARK_HEIGHT = TITLE_FONT_SIZE;

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
            <KettlewaveMark height={TOP_BAR_MARK_HEIGHT} />
            <Text style={styles.title}>DOC'S FITNESS</Text>
          </View>
          {/* A sibling of titleRow (not nested inside it) so its own width —
              which varies a lot by tab ("COMMUNITY" vs "WEEKLY CHALLENGE")
              — can never influence titleRow's width and shift the mark +
              wordmark lockup itself; titleWrap's alignItems:'center' centers
              each of them independently. */}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.rightGroup}>
          {onOpenGroupChat ? (
            <AppPressable onPress={onOpenGroupChat} hitSlop={8} style={styles.iconButton} testID="open-group-chat">
              <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
              <UnreadCountBadge count={unreadCount} style={styles.groupChatBadge} />
            </AppPressable>
          ) : (
            // A same-sized, invisible stand-in for the group-chat icon that
            // only the Community tab actually shows. Without this, the
            // right side is narrower on every other tab, titleWrap's
            // centered content shifts to fill that extra space, and the
            // mark + wordmark lockup visibly moves tab to tab.
            <View style={styles.iconButton} />
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
    fontSize: TITLE_FONT_SIZE,
    // Pulled in to match fontSize exactly -- the browser/RN default
    // leading (~1.2-1.4x) would otherwise pad the text's own box well
    // past its visual cap height, throwing off alignment against the
    // mark next to it.
    lineHeight: TITLE_FONT_SIZE,
    letterSpacing: 0.8,
  },
  subtitle: {
    color: colors.gold,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 1,
    textAlign: 'center',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
