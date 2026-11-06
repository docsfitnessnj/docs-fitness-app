import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useMembership } from '../context/MembershipContext';
import { useScheduledContent } from '../context/ScheduledContentContext';
import { formatEtTime } from '../lib/challengeSchedule';
import { colors, fonts } from '../theme';

// Round 46, Part 6: a quiet one-line countdown to the next scheduled week's
// own release instant (always Sunday 6:00pm ET) — shown on the WODs tab
// and the COW room, for paid tiers, all week long, whenever a future
// scheduled week exists at all. Deliberately never conditioned on "nothing
// is live right now" — the owner's own explicit correction to the original
// plan: the point is anticipation for Sunday, never a content-ran-out
// warning, so this renders the same whether today is Monday or Saturday.
// `nextReleaseAt` comes from a dedicated, content-free RPC
// (next_scheduled_release_at(), migration_030.sql) specifically so this can
// show for an ordinary member without their own RLS ever having to expose
// an unreleased week's actual content.
export function ScheduledReleaseCountdown() {
  const { fullContentAccess } = useMembership();
  const { nextReleaseAt } = useScheduledContent();
  if (!fullContentAccess || !nextReleaseAt) return null;
  return (
    <Text style={styles.text} testID="scheduled-release-countdown">
      THE NEW WEEK DROPS {formatEtTime(nextReleaseAt)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 12,
  },
});
