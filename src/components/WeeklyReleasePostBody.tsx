import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { parseReleaseLineSegments } from '../lib/weeklyReleaseLinks';
import { navigateToTab } from '../lib/navigationRef';
import { colors, fonts } from '../theme';

// Round 47/48 — renders the automatic "THE NEW WEEK IS LIVE" post body
// (community_posts.is_weekly_release) with each workout/COW name as a
// real tappable inline Text segment, dropping the `[[`/`]]` markers and
// the `|wod:YYYY-MM-DD` / `|cow` suffix the release function embeds.
// Returns an array of children meant to be spread directly inside an
// existing <Text>...</Text> (PostCard's truncated 3-line preview,
// PostDetailModal's full view) — never a wrapping element of its own, so
// numberOfLines/style on the parent Text keeps working exactly as before.
//
// Round 48's own lines carry real plain text around the tappable name
// (a day/date prefix, and on the Wednesday COW line a trailing
// parenthetical) — parseReleaseLineSegments() already splits a line into
// plain and tappable segments in order; this function just renders each
// one. A line with no recognizable shape at all (an ordinary member's own
// post, or an older post format) comes back as one plain segment, so it
// renders exactly as it always did before this mechanism existed.
export function renderWeeklyReleaseBody(text: string, onCloseBeforeNavigate?: () => void): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    const segments = parseReleaseLineSegments(line);
    segments.forEach((segment, j) => {
      if (segment.link) {
        const link = segment.link;
        nodes.push(
          <Text
            key={`l${i}s${j}`}
            testID={`weekly-release-link-${link.type}-${i}`}
            style={linkStyle}
            onPress={(e: any) => {
              e?.stopPropagation?.();
              onCloseBeforeNavigate?.();
              if (link.type === 'wod') navigateToTab('DocsWods', { jumpToDate: link.dateMs });
              else navigateToTab('DocsCows');
            }}
          >
            {segment.text}
          </Text>
        );
      } else if (segment.text) {
        nodes.push(<Text key={`l${i}s${j}`}>{segment.text}</Text>);
      }
    });
    if (i < lines.length - 1) nodes.push('\n');
  });
  return nodes;
}

const linkStyle: StyleProp<TextStyle> = {
  color: colors.green,
  fontFamily: fonts.labelSemiBold,
  textDecorationLine: 'underline',
};
