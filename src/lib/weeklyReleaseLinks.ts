// Round 47 -- the automatic Sunday-night release post (`is_weekly_release`,
// written by release_scheduled_weeks_if_due(), migration_031.sql) embeds a
// per-line link suffix after each workout/COW name so the community post
// renderer can turn that one line into a tappable link, without a second
// parallel data channel: the line IS the display text, just with a plain,
// human-readable `|wod:YYYY-MM-DD` / `|cow` tag appended that the renderer
// strips before showing it.
//
// Deliberately permissive: a line with no matching suffix (the OLD post
// format, if the owner runs test_week_seed.sql without migration_031.sql
// first, or any ordinary member's own post text that happens to contain a
// `|`) is simply not a link -- rendered as plain text, byte-identical to
// before this round. Nothing here can turn a normal post into a broken or
// mis-rendered one.

export type ReleaseLineLink = { type: 'wod'; dateMs: number } | { type: 'cow' };

export type ParsedReleaseLine = {
  label: string;
  link: ReleaseLineLink | null;
};

const LINE_PATTERN = /^(.*)\|(?:wod:(\d{4})-(\d{2})-(\d{2})|cow)$/;

export function parseReleaseLine(line: string): ParsedReleaseLine {
  const match = line.match(LINE_PATTERN);
  if (!match) return { label: line, link: null };
  const [, label, year, month, day] = match;
  if (year) {
    // Local-midnight calendar date, matching this app's own convention
    // everywhere else a WOD day is a Date (DateStrip, getCurrentWeek) --
    // never a UTC-parsed instant, which could land on the wrong calendar
    // day depending on the member's own timezone.
    const dateMs = new Date(Number(year), Number(month) - 1, Number(day)).getTime();
    return { label, link: { type: 'wod', dateMs } };
  }
  return { label, link: { type: 'cow' } };
}
