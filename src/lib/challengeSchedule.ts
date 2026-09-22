// The Weekly Challenge's fixed clock, in US Eastern time, correct across
// Daylight Saving changes: every challenge closes to new scores Saturday at
// 12:00pm ET, and the next one can go live Sunday at 6:00pm ET. Nothing
// here touches the three weekly badges (ON FIRE, COW KILLER, THE REGULAR),
// which stay Monday-anchored via getWeekStart in data/content.ts.
//
// Dependency-free: uses Intl.DateTimeFormat with an explicit IANA zone
// (America/New_York), which the JS engine's own timezone database already
// keeps correct for DST — no date library needed. Converting a wall-clock
// Eastern time back to a real UTC instant uses a small fixed-point
// correction (etWallTimeToUTC) rather than adding/subtracting fixed
// durations, since a fixed duration (e.g. "7 days") is not always the same
// number of real hours across a DST transition — only calendar-day
// arithmetic (this file only ever adds whole days to a Y/M/D triple) and a
// fresh per-boundary conversion are safe.

export type EasternParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function getEasternParts(date: Date): EasternParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  // Some ICU implementations render midnight as "24" under hour12:false.
  const hour = Number(map.hour) % 24;

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

// Converts a specific Eastern-time wall-clock date + time into the real UTC
// instant it refers to, correctly choosing EDT (-4) or EST (-5) for that
// exact date. A 2-round fixed-point correction: guess the instant assuming
// UTC, read back what Eastern wall-clock time that guess actually lands on,
// and shift by the difference — converges immediately since the ET offset
// is constant across the (sub-day) correction itself.
export function etWallTimeToUTC(year: number, month: number, day: number, hour: number, minute: number): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(target);
  for (let i = 0; i < 2; i++) {
    const p = getEasternParts(guess);
    const guessedAsUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess = new Date(guess.getTime() + (target - guessedAsUTC));
  }
  return guess;
}

export type ChallengeCycle = {
  // Sunday 6:00pm ET this cycle's challenge went (or can go) live.
  cycleStart: Date;
  // Saturday 12:00pm ET scores lock for this cycle.
  closeAt: Date;
  // The following Sunday 6:00pm ET — when the next cycle's challenge can go live.
  nextCycleStart: Date;
  // True from closeAt up to (not including) nextCycleStart.
  isClosed: boolean;
};

// The Sunday-to-Sunday challenge cycle containing `now`. Each boundary is
// derived from its own Eastern calendar date (never by adding a fixed
// duration to another boundary), so a DST change landing inside a cycle
// never throws the math off.
export function getChallengeCycle(now: Date = new Date()): ChallengeCycle {
  const p = getEasternParts(now);

  // The most recent Sunday's ET calendar date at/before `now`.
  const sunday = new Date(Date.UTC(p.year, p.month - 1, p.day));
  sunday.setUTCDate(sunday.getUTCDate() - p.weekday);

  let cycleStart = etWallTimeToUTC(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 18, 0);
  if (now.getTime() < cycleStart.getTime()) {
    // Earlier than 6pm ET on that Sunday itself -- that reveal hasn't
    // happened yet, so `now` is still inside the PRIOR cycle.
    sunday.setUTCDate(sunday.getUTCDate() - 7);
    cycleStart = etWallTimeToUTC(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 18, 0);
  }

  const saturday = new Date(sunday.getTime());
  saturday.setUTCDate(saturday.getUTCDate() + 6);
  const closeAt = etWallTimeToUTC(saturday.getUTCFullYear(), saturday.getUTCMonth() + 1, saturday.getUTCDate(), 12, 0);

  const nextSunday = new Date(sunday.getTime());
  nextSunday.setUTCDate(nextSunday.getUTCDate() + 7);
  const nextCycleStart = etWallTimeToUTC(
    nextSunday.getUTCFullYear(),
    nextSunday.getUTCMonth() + 1,
    nextSunday.getUTCDate(),
    18,
    0
  );

  return { cycleStart, closeAt, nextCycleStart, isClosed: now.getTime() >= closeAt.getTime() };
}

// e.g. "SATURDAY 12 PM ET" — the shared copy format for any timing line
// tied to a challenge cycle boundary (closeAt/nextRevealAt), used by both
// the full Weekly Challenge screen and the sidebar's preview module so the
// two never drift into different wording for the same instant.
export function formatEtTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    hour: 'numeric',
    minute: ms % 60000 === 0 ? undefined : '2-digit',
  })
    .format(new Date(ms))
    .toUpperCase()
    .replace(',', '')
    .replace('AM', 'AM ET')
    .replace('PM', 'PM ET');
}
