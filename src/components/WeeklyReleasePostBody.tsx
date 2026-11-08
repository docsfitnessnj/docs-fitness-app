import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { parseReleaseLine } from '../lib/weeklyReleaseLinks';
import { navigateToTab } from '../lib/navigationRef';
import { colors, fonts } from '../theme';

// Round 47 — renders the automatic "THE NEW WEEK IS LIVE" post body
// (community_posts.is_weekly_release) with each workout/COW name as a real
// tappable inline Text segment, dropping the `|wod:YYYY-MM-DD` / `|cow`
// suffix the release function embeds. Returns an array of children meant
// to be spread directly inside an existing <Text>...</Text> (PostCard's
// truncated 3-line preview, PostDetailModal's full view) — never a
// wrapping element of its own, so numberOfLines/style on the parent Text
// keeps working exactly as before.
//
// A line with no matching suffix (an ordinary member's own post, or this
// same post if the owner ran test_week_seed.sql without migration_031.sql
// first — see that migration's own comment) renders as plain text, byte-
// identical to before this round existed.
export function renderWeeklyReleaseBody(text: string, onCloseBeforeNavigate?: () => void): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    const parsed = parseReleaseLine(line);
    if (parsed.link) {
      const link = parsed.link;
      nodes.push(
        <Text
          key={`link-${i}`}
          testID={`weekly-release-link-${link.type}-${i}`}
          style={linkStyle}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            onCloseBeforeNavigate?.();
            if (link.type === 'wod') navigateToTab('DocsWods', { jumpToDate: link.dateMs });
            else navigateToTab('DocsCows');
          }}
        >
          {parsed.label}
        </Text>
      );
    } else {
      nodes.push(line);
    }
    if (i < lines.length - 1) nodes.push('\n');
  });
  return nodes;
}

const linkStyle: StyleProp<TextStyle> = {
  color: colors.green,
  fontFamily: fonts.labelSemiBold,
  textDecorationLine: 'underline',
};
