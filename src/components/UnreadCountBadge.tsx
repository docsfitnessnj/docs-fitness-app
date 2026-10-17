import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  count: number;
  style?: ViewStyle;
};

// DOC'S GROUP CHAT's unread badge — same "something new here" gold
// attention language as UnreadDot, but with a count: gold fill, dark green
// text (never the other way — gold-on-white reads as a plain pill, not an
// alert). Caps the DISPLAYED label at "99+"; the real count behind it is
// never actually clamped (see GroupChatUnreadContext), so this is purely a
// label choice. Renders nothing at all for a zero/negative count — callers
// don't need their own `unreadCount > 0` guard.
export function UnreadCountBadge({ count, style }: Props) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <View style={[styles.badge, style]} testID="group-chat-unread-badge">
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
