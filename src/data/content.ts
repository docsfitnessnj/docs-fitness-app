export type DayWod = {
  key: string;
  title: string;
  moves: string[];
  // No breakdown video exists yet for any of these five — left unset
  // rather than invented, so the WATCH VIDEO BREAKDOWN button (see
  // WatchVideoBreakdownButton) correctly shows nothing until a real video
  // URL is actually added here.
  videoUrl?: string;
};

// Monday-Friday workouts only — Saturday (Steady State Saturday) and Sunday
// (Sunday Setup) have their own admin-managed content instead, see
// weekendContent.ts, and no entry here.
export const WEEKDAY_WODS: DayWod[] = [
  { key: 'mon', title: 'THE GAUNTLET', moves: ['5 Rounds', '10 Kettlebell Swings', '10 Goblet Squats', '10 Push-Ups', '200m Run'] },
  { key: 'tue', title: 'IRON GRIP', moves: ['4 Rounds', '15 Farmer Carries (50m)', '12 Pull-Ups', '20 Sit-Ups'] },
  { key: 'wed', title: 'THE GRINDER', moves: ['AMRAP 20', '10 Burpees', '15 Wall Balls', '20 Lunges'] },
  { key: 'thu', title: 'SWING SET', moves: ['21-15-9', 'Kettlebell Swings', 'Box Jumps', 'Push-Press'] },
  { key: 'fri', title: 'FRIDAY FURY', moves: ['3 Rounds for Time', '400m Run', '20 Kettlebell Snatches', '15 Toes-to-Bar'] },
];

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// Saturday is STEADY STATE SATURDAY (a Zone 2 cardio day, loggable like a
// WOD); Sunday is SUNDAY SETUP (prep + a quote, no workout to log). Set
// alongside `isRestDay` below, which keeps its original meaning — "not one
// of the 5 weekday WODs" — unchanged, since ON FIRE and the free tier's
// Mon/Tue unlock both key off that exact meaning. `weekendKind` is the
// separate, additive flag consumers use to know a weekend day now has its
// own real content instead of being a true rest day.
export type WeekendKind = 'saturday' | 'sunday';

export type WeekDay = {
  date: Date;
  label: string;
  dateNumber: number;
  isToday: boolean;
  isRestDay: boolean;
  wod?: DayWod;
  weekendKind?: WeekendKind;
};

// The two weekend days' fixed, never-changing display names — used
// wherever they're shown as a heading and for the auto-filled post title
// pattern (e.g. "STEADY STATE SATURDAY · SEP 19, 2026").
export const STEADY_STATE_SATURDAY_NAME = 'STEADY STATE SATURDAY';
export const SUNDAY_SETUP_NAME = 'SUNDAY SETUP';

// Stable log/completion key for Steady State Saturday, parallel to the
// weekday WODs' own 'mon'..'fri' keys — used wherever a Saturday's workout
// log or completion state needs a dayKey. Sunday has no such key: Sunday
// Setup has nothing to log or mark complete, only a post to share.
export const STEADY_STATE_SATURDAY_KEY = 'sat';

// True once a day has *something* to show — a weekday WOD or a weekend
// day's own content — false only for a genuine empty rest day. Every day
// of the week now has content, so this is the one place UI should check
// instead of `isRestDay` when deciding whether to render a lock/complete
// state or the old plain "Rest day" card.
export function dayHasContent(day: WeekDay): boolean {
  return !!day.wod || !!day.weekendKind;
}

// Free (online, post-trial) accounts get these two weekdays unlocked out of the 5 — checked
// by the WOD's stable key so it holds regardless of which real week/date is showing.
export const FREE_UNLOCKED_WOD_KEYS = ['mon', 'tue'];

export type WodAccessLevel = 'full' | 'partial' | 'none';

// Also the correct gate for Steady State Saturday and Sunday Setup: a
// weekend WeekDay's `wod` is always undefined, so a partial (free) account
// falls through to `false` here for either one, same as any other locked
// weekday — free members get exactly their 2 of 5 weekdays, nothing more.
export function isDayWodUnlocked(day: WeekDay, wodAccessLevel: WodAccessLevel): boolean {
  if (wodAccessLevel === 'full') return true;
  if (wodAccessLevel === 'none') return false;
  return !!day.wod && FREE_UNLOCKED_WOD_KEYS.includes(day.wod.key);
}

function dayInfoForDate(date: Date, today: Date): WeekDay {
  const jsDay = date.getDay(); // 0 = Sunday
  const mondayIndexed = jsDay === 0 ? 6 : jsDay - 1;
  const isRestDay = mondayIndexed >= 5;
  return {
    date,
    label: DAY_LABELS[mondayIndexed],
    dateNumber: date.getDate(),
    isToday: isSameDay(date, today),
    isRestDay,
    wod: isRestDay ? undefined : WEEKDAY_WODS[mondayIndexed],
    weekendKind: mondayIndexed === 5 ? 'saturday' : mondayIndexed === 6 ? 'sunday' : undefined,
  };
}

// This week and next week, Monday-Sunday, 14 days back to back — the full
// schedule's calendar grid. `isToday` on every entry is still computed
// against the real `now`, not whichever week it falls in, so next week's
// days are never mismarked.
export function getTwoWeekCalendar(now: Date = new Date()): WeekDay[] {
  const weekStart = getWeekStart(now);
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return dayInfoForDate(date, now);
  });
}

// Returns the Monday-Sunday week containing `today`, with each weekday's real WOD attached.
export function getCurrentWeek(today: Date = new Date()): WeekDay[] {
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);

  return DAY_LABELS.map((_label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return dayInfoForDate(date, today);
  });
}

// Rolling range starting today and running `count` days forward — used by the booking
// date strip, which needs to scroll well past the current Mon-Sun week.
export function getUpcomingDays(count: number, today: Date = new Date()): WeekDay[] {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return dayInfoForDate(date, today);
  });
}

// Monday 12:00 AM local for the week containing `today` — the shared clock
// weekly badges reset against. Nothing needs to run at midnight Monday to
// "reset" them: every read just re-derives "this week" from the current
// date, so a badge earned last week naturally stops qualifying once the
// date rolls past the new Monday.
export function getWeekStart(today: Date = new Date()): Date {
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);
  return monday;
}

// The next Sunday at/after `from`, at local midnight — "upcoming" is
// inclusive of today, so calling this on a Sunday returns that same day.
// Used both to seed the Sunday quote cycle's starting point and to jump it
// back to the top when Doc restarts it.
export function getNextSunday(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay(); // 0 = Sunday
  if (jsDay !== 0) d.setDate(d.getDate() + (7 - jsDay));
  return d;
}

export function isThisWeek(timestamp: number, today: Date = new Date()): boolean {
  const start = getWeekStart(today).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return timestamp >= start && timestamp < end;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatFullDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Short, all-caps date used in auto-filled post titles, e.g. "AUG 17, 2026".
export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// Splits a movement string like "10 Kettlebell Swings" into a right-aligned
// rep count and the movement name, for the "THE WORK" style movement rows.
export function parseMoveRow(move: string): { reps?: string; name: string } {
  const match = move.match(/^(\d[\w:+/-]*)\s+(.+)/);
  if (match) return { reps: match[1], name: match[2] };
  return { name: move };
}
