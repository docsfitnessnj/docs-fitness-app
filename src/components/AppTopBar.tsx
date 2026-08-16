import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MembershipToggle } from './MembershipToggle';
import { KettlebellWaveMark } from './brand/KettlebellWaveMark';
import { colors, fonts } from '../theme';

type Props = {
  subtitle?: string;
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
};

export function AppTopBar({ subtitle, onOpenSidebar, onOpenSearch }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.bar}>
        <Pressable onPress={onOpenSidebar} hitSlop={8} style={styles.iconButton} testID="open-sidebar">
          <Ionicons name="menu-outline" size={24} color={colors.text} />
        </Pressable>

        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <KettlebellWaveMark color={colors.green} size={18} strokeWidth={9} />
            <Text style={styles.title}>DOC'S FITNESS</Text>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.rightGroup}>
          <Pressable onPress={onOpenSearch} hitSlop={8} style={styles.iconButton} testID="open-search">
            <Ionicons name="search-outline" size={22} color={colors.text} />
          </Pressable>
          <MembershipToggle />
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
