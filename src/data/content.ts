export type DayWod = {
  key: string;
  title: string;
  moves: string[];
};

// Monday-Friday workouts. Saturday and Sunday are rest days with no entry here.
export const WEEKDAY_WODS: DayWod[] = [
  { key: 'mon', title: 'THE GAUNTLET', moves: ['5 Rounds', '10 Kettlebell Swings', '10 Goblet Squats', '10 Push-Ups', '200m Run'] },
  { key: 'tue', title: 'IRON GRIP', moves: ['4 Rounds', '15 Farmer Carries (50m)', '12 Pull-Ups', '20 Sit-Ups'] },
  { key: 'wed', title: 'THE GRINDER', moves: ['AMRAP 20', '10 Burpees', '15 Wall Balls', '20 Lunges'] },
  { key: 'thu', title: 'SWING SET', moves: ['21-15-9', 'Kettlebell Swings', 'Box Jumps', 'Push-Press'] },
  { key: 'fri', title: 'FRIDAY FURY', moves: ['3 Rounds for Time', '400m Run', '20 Kettlebell Snatches', '15 Toes-to-Bar'] },
];

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export type WeekDay = {
  date: Date;
  label: string;
  dateNumber: number;
  isToday: boolean;
  isRestDay: boolean;
  wod?: DayWod;
};

// Free (online, post-trial) accounts get these two weekdays unlocked out of the 5 — checked
// by the WOD's stable key so it holds regardless of which real week/date is showing.
export const FREE_UNLOCKED_WOD_KEYS = ['mon', 'tue'];

export type WodAccessLevel = 'full' | 'partial' | 'none';

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
  };
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

// Splits a movement string like "10 Kettlebell Swings" into a right-aligned
// rep count and the movement name, for the "THE WORK" style movement rows.
export function parseMoveRow(move: string): { reps?: string; name: string } {
  const match = move.match(/^(\d[\w:+/-]*)\s+(.+)/);
  if (match) return { reps: match[1], name: match[2] };
  return { name: move };
}
