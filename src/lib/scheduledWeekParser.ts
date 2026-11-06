import * as XLSX from 'xlsx';
import { ContentCowScoringType } from '../context/ContentLibraryContext';
import { ScheduledCowInput, ScheduledDayOfWeek, ScheduledWodInput } from '../context/ScheduledContentContext';
import { getWeekStart } from '../data/content';

// Round 46, Part 4: parses an admin-uploaded .xlsx/.csv into the same
// {weekStartDate, wods, cow} shape ScheduledContentContext.importWeeks()
// already expects — a preview is built first (this module's own job),
// shown to the admin, and only THEIR explicit confirm actually writes
// anything (ScheduledWeekImportScreen.tsx's job).

const DAY_MAP: Record<string, ScheduledDayOfWeek> = {
  MONDAY: 'mon',
  TUESDAY: 'tue',
  THURSDAY: 'thu',
  FRIDAY: 'fri',
};

const SCORING_MAP: Record<string, ContentCowScoringType> = {
  'FOR TIME': 'time',
  AMRAP: 'rounds_reps',
  EMOM: 'emom',
};

export type ParsedWeekPreview = {
  weekStartDate: number;
  wods: ScheduledWodInput[];
  cow: ScheduledCowInput | null;
  // Human-readable issues specific to this one week: missing fields, a
  // duplicate day, a WOD dated Wednesday, no COW at all.
  problems: string[];
};

export type ImportPreview = {
  weeks: ParsedWeekPreview[];
  // Problems that don't belong to any one week — an unreadable file, a
  // sheet with no recognizable header row, a row whose date won't parse.
  globalProblems: string[];
};

// Keys are normalized (trimmed, lowercased) so a header's exact casing or
// incidental whitespace in the uploaded file never matters.
function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.trim().toLowerCase()] = v == null ? '' : String(v).trim();
  }
  return out;
}

// "11/10/2026" (the brief's own specified format) or a real Excel date
// cell (already converted to a JS Date by `cellDates: true` at read time,
// so `value` can arrive here as either a string or a Date).
function parseMDY(value: unknown): number | null {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  }
  const text = String(value ?? '').trim();
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function splitMovements(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function findWeek(weeks: Map<number, ParsedWeekPreview>, weekStartDate: number): ParsedWeekPreview {
  let week = weeks.get(weekStartDate);
  if (!week) {
    week = { weekStartDate, wods: [], cow: null, problems: [] };
    weeks.set(weekStartDate, week);
  }
  return week;
}

function sheetHeaderKeys(sheet: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
}

function isWodSheet(keys: string[]): boolean {
  return keys.includes('day') && keys.includes('workout name');
}

function isCowSheet(keys: string[]): boolean {
  return keys.includes('challenge name');
}

function parseWodSheet(sheet: XLSX.WorkSheet, weeks: Map<number, ParsedWeekPreview>, globalProblems: string[]) {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const seenDayPerWeek = new Set<string>();

  rows.forEach((raw, index) => {
    const row = normalizeRow(raw);
    const rowLabel = `WODs row ${index + 2}`; // +2: 1-indexed, plus the header row itself

    // Skip rows with empty Workout name, per the brief — not even reported
    // as a problem, since a genuinely blank trailing row is expected.
    if (!row['workout name']) return;

    const releaseDateMs = parseMDY(row['release date']);
    if (releaseDateMs == null) {
      globalProblems.push(`${rowLabel}: "${row['release date']}" isn't a valid m/d/yyyy date.`);
      return;
    }

    const dayKey = (row['day'] ?? '').toUpperCase();
    const dayOfWeek = DAY_MAP[dayKey];
    if (!dayOfWeek) {
      globalProblems.push(`${rowLabel}: "${row['day']}" isn't MONDAY, TUESDAY, THURSDAY, or FRIDAY.`);
      return;
    }

    const weekStartDate = getWeekStart(new Date(releaseDateMs)).getTime();
    const week = findWeek(weeks, weekStartDate);

    const dedupeKey = `${weekStartDate}-${dayOfWeek}`;
    if (seenDayPerWeek.has(dedupeKey)) {
      week.problems.push(`Two WODs both dated ${dayKey} this week — only the first was kept.`);
      return;
    }
    seenDayPerWeek.add(dedupeKey);

    // A real calendar weekday check: the literal Release date given must
    // actually fall on the day named in Day — a mismatch is exactly the
    // kind of data-entry slip the preview is for catching before it's
    // too late, rather than silently trusting whichever one is "more
    // official."
    const actualWeekday = new Date(releaseDateMs).getDay();
    const expectedWeekday = { mon: 1, tue: 2, thu: 4, fri: 5 }[dayOfWeek];
    if (actualWeekday !== expectedWeekday) {
      week.problems.push(`${row['workout name']}: Release date ${row['release date']} isn't actually a ${dayKey}.`);
    }

    if (!row['format']) week.problems.push(`${row['workout name']}: no Format given.`);
    if (!row['movements']) week.problems.push(`${row['workout name']}: no Movements given.`);

    week.wods.push({
      dayOfWeek,
      name: row['workout name'],
      format: row['format'] ?? '',
      formatDescription: row['format description'] ?? '',
      movements: splitMovements(row['movements'] ?? ''),
      videoUrl: row['video url'] ?? '',
      notes: row['notes'] ?? '',
    });
  });
}

function parseCowSheet(sheet: XLSX.WorkSheet, weeks: Map<number, ParsedWeekPreview>, globalProblems: string[]) {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  rows.forEach((raw, index) => {
    const row = normalizeRow(raw);
    const rowLabel = `COWs row ${index + 2}`;

    if (!row['challenge name']) return;

    const weekOfMs = parseMDY(row['week of']);
    if (weekOfMs == null) {
      globalProblems.push(`${rowLabel}: "${row['week of']}" isn't a valid m/d/yyyy date.`);
      return;
    }

    const scoringKey = (row['scoring type'] ?? '').toUpperCase();
    const scoringType = SCORING_MAP[scoringKey];
    if (!scoringType) {
      globalProblems.push(`${rowLabel}: "${row['scoring type']}" isn't FOR TIME, AMRAP, or EMOM.`);
      return;
    }

    const weekStartDate = getWeekStart(new Date(weekOfMs)).getTime();
    const week = findWeek(weeks, weekStartDate);

    if (week.cow) {
      week.problems.push(`Two COWs both given for this same week — only the first was kept.`);
      return;
    }

    week.cow = {
      name: row['challenge name'],
      videoUrl: row['video url'] ?? '',
      scoringType,
      kettlebells: row['prescribed kettlebells'] || undefined,
      theWork: row['the work'] || undefined,
      theCatch: row['the catch'] || undefined,
      finishNote: row['finish note'] || undefined,
    };
  });
}

export function buildImportPreview(fileBytes: ArrayBuffer): ImportPreview {
  const globalProblems: string[] = [];
  const weeks = new Map<number, ParsedWeekPreview>();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBytes, { type: 'array', cellDates: true });
  } catch {
    return { weeks: [], globalProblems: ["Couldn't read this file — is it a real .xlsx or .csv?"] };
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const keys = sheetHeaderKeys(sheet);
    if (isWodSheet(keys)) {
      parseWodSheet(sheet, weeks, globalProblems);
    } else if (isCowSheet(keys)) {
      parseCowSheet(sheet, weeks, globalProblems);
    } else if (keys.length > 0) {
      globalProblems.push(`Sheet "${sheetName}" doesn't look like either a WODs or a COWs sheet — skipped.`);
    }
  }

  // A week with no COW at all, and a week with a WOD mistakenly landing on
  // Wednesday, are both explicitly called out by the brief as problems to
  // surface — the Wednesday case can only happen if a WOD row's own Day
  // column is somehow Wednesday, which DAY_MAP already refuses to parse at
  // all (only MON/TUE/THU/FRI are valid), so that case is already caught
  // above as a per-row "isn't MONDAY/TUESDAY/THURSDAY/FRIDAY" problem; the
  // no-COW case is checked here, once, per week.
  for (const week of weeks.values()) {
    if (!week.cow) week.problems.push('No COW given for this week.');
  }

  return {
    weeks: Array.from(weeks.values()).sort((a, b) => a.weekStartDate - b.weekStartDate),
    globalProblems,
  };
}
