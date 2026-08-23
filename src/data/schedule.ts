export type ClassType = 'Kettlebell Strength' | 'Kettlebell Cardio' | 'Hybrid';

export type ClassRow = {
  id: string;
  time: string;
  className: string;
  classType: ClassType;
};

export type ScheduleSection = {
  key: 'mwf' | 'tth' | 'saturday' | 'sunday';
  heading: string;
  rows: ClassRow[];
  note?: string;
};

// Real weekly class calendar at the Boathouse.
const MWF_ROWS: ClassRow[] = [
  { id: 'mwf-530a', time: '5:30 AM', className: 'Dawn Patrol', classType: 'Kettlebell Strength' },
  { id: 'mwf-930a', time: '9:30 AM', className: 'Dawn Patrol', classType: 'Kettlebell Strength' },
];

const TTH_ROWS: ClassRow[] = [
  { id: 'tth-930a', time: '9:30 AM', className: 'Dawn Patrol', classType: 'Kettlebell Cardio' },
];

const SATURDAY_ROWS: ClassRow[] = [
  { id: 'sat-815a', time: '8:15 AM', className: 'Savage Saturday', classType: 'Hybrid' },
];

export const SCHEDULE: ScheduleSection[] = [
  { key: 'mwf', heading: 'MONDAY, WEDNESDAY, FRIDAY', rows: MWF_ROWS },
  { key: 'tth', heading: 'TUESDAY, THURSDAY', rows: TTH_ROWS },
  { key: 'saturday', heading: 'SATURDAY', rows: SATURDAY_ROWS },
  { key: 'sunday', heading: 'SUNDAY', rows: [], note: 'Rest day. Community events posted week to week.' },
];

// Returns the class rows for a given Mon-Sun week index (0=Mon ... 6=Sun).
export function rowsForWeekdayIndex(index: number): ClassRow[] {
  if (index === 0 || index === 2 || index === 4) return MWF_ROWS;
  if (index === 1 || index === 3) return TTH_ROWS;
  if (index === 5) return SATURDAY_ROWS;
  return [];
}

// Same lookup keyed off a real Date, for the rolling booking date strip.
export function rowsForDate(date: Date): ClassRow[] {
  const jsDay = date.getDay(); // 0 = Sunday
  const mondayIndexed = jsDay === 0 ? 6 : jsDay - 1;
  return rowsForWeekdayIndex(mondayIndexed);
}

export const LOCATION_NAME = "Dr. John W. Holland Boathouse";
export const LOCATION_CITY = 'Ventnor City, NJ';

function parseTimeToMinutes(time: string): number {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export type NextClass = { date: Date; row: ClassRow };

// The next class starting from `from` — today's remaining classes first
// (time-aware, so a class earlier today doesn't show as "next"), otherwise
// the first class on the next day that has any. Sunday has none, so this
// always resolves within a week.
export function findNextClass(from: Date): NextClass | null {
  const nowMinutes = from.getHours() * 60 + from.getMinutes();
  for (let offset = 0; offset < 8; offset++) {
    const date = new Date(from);
    date.setDate(date.getDate() + offset);
    const rows = rowsForDate(date);
    const candidates = offset === 0 ? rows.filter((row) => parseTimeToMinutes(row.time) >= nowMinutes) : rows;
    if (candidates.length > 0) {
      return { date, row: candidates[0] };
    }
  }
  return null;
}
