import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BadgeDetailModal } from './BadgeDetailModal';
import { BadgeIcon } from './icons/BadgeIcon';
import { BADGE_MAP, BadgeId, PERMANENT_DISPLAY_ORDER, WEEKLY_DISPLAY_ORDER } from '../data/badges';
import { useBadges } from '../context/BadgeContext';
import { colors, fonts } from '../theme';

// All 6 badges, earned in gold, unearned as gray silhouettes — tapping any
// of them (earned or not) opens the name + description, so the grays
// double as an ad for how to earn them.
export function ProfileBadgeCase() {
  const { myBadgeIds } = useBadges();
  const [selected, setSelected] = useState<BadgeId | null>(null);
  const earnedSet = new Set(myBadgeIds);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>TROPHY CASE</Text>
      <View style={styles.grid}>
        {[...PERMANENT_DISPLAY_ORDER, ...WEEKLY_DISPLAY_ORDER].map((id) => {
          const def = BADGE_MAP[id];
          const earned = earnedSet.has(def.id);
          return (
            <Pressable
              key={def.id}
              style={styles.cell}
              onPress={() => setSelected(def.id)}
              testID={`profile-badge-${def.id}`}
            >
              <BadgeIcon id={def.id} earned={earned} size={62} />
              <Text style={[styles.cellLabel, !earned && styles.cellLabelUnearned]} numberOfLines={2}>
                {def.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <BadgeDetailModal badgeId={selected} earned={selected ? earnedSet.has(selected) : false} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 8,
    marginBottom: 24,
  },
  heading: {
    alignSelf: 'flex-start',
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cell: {
    width: '31%',
    alignItems: 'center',
    marginBottom: 16,
  },
  cellLabel: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 6,
  },
  cellLabelUnearned: {
    color: colors.textMuted,
  },
});
