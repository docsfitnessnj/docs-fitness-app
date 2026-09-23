import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

type Props = {
  size?: number;
  style?: ViewStyle;
};

// The one gold "something new here" dot — the hamburger's MESSAGE DOC row
// (a member has an unread reply from Doc), DOC'S INBOX rows (a member sent
// Doc something she hasn't read), same visual language as the Community
// feed's existing unread dot.
export function UnreadDot({ size = 10, style }: Props) {
  return <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2 }, style]} testID="unread-dot" />;
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: colors.goldBright,
  },
});
