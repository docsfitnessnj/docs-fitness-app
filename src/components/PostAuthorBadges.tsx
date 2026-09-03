import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BadgeIcon } from './icons/BadgeIcon';
import { BadgeId, INLINE_BADGE_CAP } from '../data/badges';
import { useBadges } from '../context/BadgeContext';
import { colors, fonts } from '../theme';

const INLINE_SIZE = 18;

// Small badge row next to an author's name on a post or comment — earned
// badges only (never unearned/gray here), THE JOKER first, then currently-
// held weeklies, then permanent milestones, capped with a +N overflow.
//
// `exclude` lets a specific display context drop a badge from just its own
// row (e.g. the status banner hiding Day One Doug, which assumes a first
// workout that a brand-new Crew member hasn't necessarily logged yet) —
// the badge itself stays fully earned and still shows everywhere else this
// component is used unfiltered.
export function PostAuthorBadges({ author, exclude }: { author: string; exclude?: BadgeId[] }) {
  const { getBadgesForAuthor } = useBadges();
  const ids = exclude ? getBadgesForAuthor(author).filter((id) => !exclude.includes(id)) : getBadgesForAuthor(author);

  if (ids.length === 0) return null;

  const shown = ids.slice(0, INLINE_BADGE_CAP);
  const overflow = ids.length - shown.length;

  return (
    <View style={styles.row}>
      {shown.map((id: BadgeId) => (
        <BadgeIcon key={id} id={id} earned size={INLINE_SIZE} />
      ))}
      {overflow > 0 && (
        <View style={styles.overflow}>
          <Text style={styles.overflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
  },
  overflow: {
    backgroundColor: colors.background,
    borderRadius: 9,
    paddingHorizontal: 5,
    height: INLINE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 10,
  },
});
