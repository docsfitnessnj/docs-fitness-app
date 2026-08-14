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

// Returns the Monday-Sunday week containing `today`, with each weekday's real WOD attached.
export function getCurrentWeek(today: Date = new Date()): WeekDay[] {
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);

  return DAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const isRestDay = index >= 5;
    return {
      date,
      label,
      dateNumber: date.getDate(),
      isToday: isSameDay(date, today),
      isRestDay,
      wod: isRestDay ? undefined : WEEKDAY_WODS[index],
    };
  });
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
