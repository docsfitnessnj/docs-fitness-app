import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { BadgeDetailModal } from '../components/BadgeDetailModal';
import { BadgeIcon } from '../components/icons/BadgeIcon';
import { BADGE_DEFS, BadgeId } from '../data/badges';
import { useBadges } from '../context/BadgeContext';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onVerifyJoker: () => void;
};

export function TrophyCaseScreen({ visible, onClose, onVerifyJoker }: Props) {
  const badges = useBadges();
  const { isAdmin } = useMembership();
  const [selected, setSelected] = useState<BadgeId | null>(null);
  const earnedSet = new Set(badges.myBadgeIds);

  if (!visible) return null;

  const progressFor = (id: BadgeId): string => {
    switch (id) {
      case 'joker':
        return earnedSet.has('joker') ? 'EARNED' : 'NOT YET EARNED';
      case 'on_fire':
        return `${badges.onFireProgress.count} of ${badges.onFireProgress.target} WODs this week`;
      case 'cow_killer':
        return badges.cowKillerEarned ? 'EARNED THIS WEEK' : 'NOT YET THIS WEEK';
      case 'the_regular':
        return `${badges.regularProgress.count} of ${badges.regularProgress.target} posted this week`;
      case 'day_one_doug':
        return badges.dayOneDougEarned ? 'EARNED' : 'LOG YOUR FIRST WORKOUT';
      case 'hundred_down':
        return `${badges.totalWorkoutsLogged} of 100 workouts logged`;
      default:
        return '';
    }
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="THE TROPHY CASE" onBack={onClose} backTestID="close-trophy-case" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtext}>
          Six badges, permanent and weekly. Earned ones stay gold — tap any of them, earned or not, for the full
          story.
        </Text>

        {BADGE_DEFS.map((def) => {
          const earned = earnedSet.has(def.id);
          return (
            <Pressable
              key={def.id}
              style={styles.row}
              onPress={() => setSelected(def.id)}
              testID={`trophy-case-badge-${def.id}`}
            >
              <BadgeIcon id={def.id} earned={earned} size={44} />
              <View style={styles.rowMain}>
                <View style={styles.rowNameLine}>
                  <Text style={styles.rowName}>{def.name}</Text>
                  <Text style={styles.rowKind}>{def.kind === 'permanent' ? 'PERMANENT' : 'WEEKLY'}</Text>
                </View>
                <Text style={styles.rowDescription} numberOfLines={2}>
                  {def.description}
                </Text>
                <Text style={[styles.rowProgress, earned && styles.rowProgressEarned]}>{progressFor(def.id)}</Text>
              </View>
            </Pressable>
          );
        })}

        {isAdmin && (
          <Pressable
            style={styles.devRecapButton}
            onPress={badges.previewMonthlyRecap}
            testID="preview-monthly-recap"
          >
            <Text style={styles.devRecapButtonText}>PREVIEW THIS MONTH'S RECAP (DEV)</Text>
          </Pressable>
        )}
      </ScrollView>

      <BadgeDetailModal
        badgeId={selected}
        earned={selected ? earnedSet.has(selected) : false}
        onClose={() => setSelected(null)}
        onVerifyJoker={
          selected === 'joker'
            ? () => {
                setSelected(null);
                onVerifyJoker();
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  rowMain: {
    flex: 1,
  },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowName: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  rowKind: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1,
  },
  rowDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  rowProgress: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  rowProgressEarned: {
    color: colors.gold,
  },
  devRecapButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 8,
  },
  devRecapButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
});
