export type ClassRow = {
  id: string;
  time: string;
  label: string;
};

export type ScheduleSection = {
  key: 'weekday' | 'saturday' | 'sunday';
  heading: string;
  rows: ClassRow[];
  note?: string;
};

// Placeholder times — easy to edit as the real class calendar is confirmed.
const WEEKDAY_ROWS: ClassRow[] = [
  { id: 'weekday-530a', time: '5:30 AM', label: 'Group Training' },
  { id: 'weekday-630a', time: '6:30 AM', label: 'Group Training' },
  { id: 'weekday-900a', time: '9:00 AM', label: 'Group Training' },
  { id: 'weekday-430p', time: '4:30 PM', label: 'Group Training' },
  { id: 'weekday-530p', time: '5:30 PM', label: 'Group Training' },
];

const SATURDAY_ROWS: ClassRow[] = [
  { id: 'saturday-800a', time: '8:00 AM', label: 'Group Training' },
  { id: 'saturday-900a', time: '9:00 AM', label: 'Group Training' },
];

export const SCHEDULE: ScheduleSection[] = [
  { key: 'weekday', heading: 'MONDAY–FRIDAY', rows: WEEKDAY_ROWS },
  { key: 'saturday', heading: 'SATURDAY', rows: SATURDAY_ROWS },
  { key: 'sunday', heading: 'SUNDAY', rows: [], note: 'Rest day. Community events posted week to week.' },
];

// Returns the sign-up rows for a given Mon-Sun week index (0=Mon ... 6=Sun).
export function rowsForWeekdayIndex(index: number): ClassRow[] {
  if (index <= 4) return WEEKDAY_ROWS;
  if (index === 5) return SATURDAY_ROWS;
  return [];
}

export const LOCATION_NAME = "Dr. John W. Holland Boathouse";
export const LOCATION_CITY = 'Ventnor City, NJ';
