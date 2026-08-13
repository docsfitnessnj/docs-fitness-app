import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MembershipToggle } from './MembershipToggle';
import { colors, fonts } from '../theme';

type Props = {
  onOpenSearch: () => void;
  onOpenMessages: () => void;
};

export function AppTopBar({ onOpenSearch, onOpenMessages }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.bar}>
        <Pressable onPress={onOpenSearch} hitSlop={8} style={styles.iconButton}>
          <Ionicons name="search" size={20} color={colors.text} />
        </Pressable>

        <Text style={styles.title}>DOC'S FITNESS</Text>

        <View style={styles.rightGroup}>
          <Pressable onPress={onOpenMessages} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} />
          </Pressable>
          <MembershipToggle />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.locked,
  },
  iconButton: {
    padding: 4,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 17,
    letterSpacing: 0.5,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
