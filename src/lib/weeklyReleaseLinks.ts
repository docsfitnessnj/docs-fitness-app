// Round 47/48 -- the automatic Sunday-night release post
// (`is_weekly_release`, written by release_scheduled_weeks_if_due(),
// migration_031.sql/migration_032.sql) embeds a tappable name directly
// inside an otherwise-plain line of text, so the community post renderer
// can turn just that one segment into a link, without a second parallel
// data channel: the line IS the display text, just with plain,
// human-readable markers around the one part of it that's tappable.
//
// Round 48's post body needs a tappable name embedded in the MIDDLE of a
// line (`MONDAY 11/10/26: [[THE FIRST TEE]]|wod:2026-11-10`, or with a
// trailing parenthetical after the name on the COW line) -- Round 47's
// own shape only ever made the WHOLE line a link. `[[`/`]]` mark the
// start/end of the tappable name itself; the `|wod:YYYY-MM-DD` / `|cow`
// suffix at the very end of the line still carries the navigation target,
// unchanged from Round 47.
//
// Three shapes are parsed, in order, each one a graceful fallback for the
// next-older post format -- never a crash, never a leaked raw marker:
//   1. Round 48: `<plain prefix>[[<name>]]<plain suffix>|wod:YYYY-MM-DD`
//      or `...|cow` -- a tappable name with real plain text around it.
//   2. Round 47: `<name>|wod:YYYY-MM-DD` / `<name>|cow` -- the whole line
//      is the tappable name, no `[[`/`]]` markers at all (a post from
//      before migration_032.sql, or the owner's own test seed run
//      against migration_031.sql only).
//   3. Anything else (an ordinary member's own post, or a post from
//      before migration_031.sql ever existed) -- the whole line renders
//      as plain, non-tappable text, byte-identical to before Round 47.

export type ReleaseLineLink = { type: 'wod'; dateMs: number } | { type: 'cow' };

export type ReleaseLineSegment = {
  text: string;
  link: ReleaseLineLink | null;
};

const NEW_LINE_PATTERN = /^(.*)\[\[(.*)\]\](.*)\|(?:wod:(\d{4})-(\d{2})-(\d{2})|cow)$/;
const OLD_LINE_PATTERN = /^(.*)\|(?:wod:(\d{4})-(\d{2})-(\d{2})|cow)$/;

function linkFromDateParts(year?: string, month?: string, day?: string): ReleaseLineLink {
  if (year) {
    // Local-midnight calendar date, matching this app's own convention
    // everywhere else a WOD day is a Date (DateStrip, getCurrentWeek) --
    // never a UTC-parsed instant, which could land on the wrong calendar
    // day depending on the member's own timezone.
    const dateMs = new Date(Number(year), Number(month) - 1, Number(day)).getTime();
    return { type: 'wod', dateMs };
  }
  return { type: 'cow' };
}

// Splits one line of a release post into plain-text and tappable-name
// segments, in left-to-right order. A line with no recognizable shape at
// all comes back as a single, non-tappable segment -- the line itself.
export function parseReleaseLineSegments(line: string): ReleaseLineSegment[] {
  const newMatch = line.match(NEW_LINE_PATTERN);
  if (newMatch) {
    const [, prefix, name, suffix, year, month, day] = newMatch;
    const link = linkFromDateParts(year, month, day);
    const segments: ReleaseLineSegment[] = [];
    if (prefix) segments.push({ text: prefix, link: null });
    segments.push({ text: name, link });
    if (suffix) segments.push({ text: suffix, link: null });
    return segments;
  }

  const oldMatch = line.match(OLD_LINE_PATTERN);
  if (oldMatch) {
    const [, label, year, month, day] = oldMatch;
    return [{ text: label, link: linkFromDateParts(year, month, day) }];
  }

  return [{ text: line, link: null }];
}
