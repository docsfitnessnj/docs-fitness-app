import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsBadge } from './brand/DocsBadge';
import { openMerchStore, openLocationMaps } from '../lib/links';
import { colors, fonts, TAGLINE, LOCATION } from '../theme';

const MEMBER_COUNT = 128;

type Props = {
  onOpenMessages: () => void;
};

export function IdentitySidebar({ onOpenMessages }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.brandMark}>
        <DocsBadge variant="white" size={80} />
      </View>
      <Text style={styles.name}>DOC'S FITNESS</Text>
      <Text style={styles.tagline}>{TAGLINE}</Text>

      <View style={styles.memberRow}>
        <Ionicons name="people-outline" size={14} color={colors.green} />
        <Text style={styles.memberCount}>{MEMBER_COUNT} MEMBERS</Text>
      </View>

      <View style={styles.divider} />

      <Pressable style={styles.linkRow} onPress={onOpenMessages}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.green} />
        <Text style={styles.linkText}>Message Doc</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={openMerchStore}>
        <Ionicons name="bag-handle-outline" size={18} color={colors.green} />
        <Text style={styles.linkText}>Doc's Merch Store</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={openLocationMaps}>
        <Ionicons name="location-outline" size={18} color={colors.green} />
        <Text style={styles.linkText}>
          {LOCATION.name}, {LOCATION.city}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 20,
    alignItems: 'center',
  },
  brandMark: {
    marginBottom: 12,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  memberCount: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.hairline,
    marginVertical: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    paddingVertical: 10,
  },
  linkText: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
});
