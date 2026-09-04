import { ContentWorkoutInput, ContentWorkoutStatus, ContentWorkoutType } from '../context/ContentLibraryContext';

// The bulk-paste format: one workout per block, separated by a line of
// three or more dashes ("---"). Each block is a set of "Label: value"
// lines; Movements is the one multi-line field — every line after it is
// read as one movement per line until the next recognized label (or the
// block ends). Forgiving on purpose: label matching is case-insensitive,
// blank lines are ignored, and a handful of common aliases are accepted
// for Type/Status so a slightly different word choice doesn't fail the
// whole paste.
export const BULK_IMPORT_EXAMPLE = `Name: THE GAUNTLET
Type: WOD
Format: 5 Rounds For Time
Format Description: Complete all 5 rounds as fast as possible, resting only as needed.
Movements:
Kettlebell Swings
Goblet Squats
Push-Ups
Video: https://youtube.com/watch?v=example
Notes: Scale swings to a lighter bell for beginners.
Release: 2026-09-08 06:00
Status: Scheduled
---
Name: SWING CHALLENGE
Type: Challenge of the Week
Format: 10min AMRAP
Format Description: As many rounds as possible of the full sequence.
Movements:
Kettlebell Swings
Box Jumps
Video: https://youtube.com/watch?v=example2
Notes:
Release: 2026-09-11 06:00
Status: Draft`;

const LABELS = [
  'name',
  'type',
  'format',
  'format description',
  'movements',
  'video',
  'notes',
  'release',
  'status',
] as const;
type Label = (typeof LABELS)[number];

function matchLabel(line: string): { label: Label; value: string } | null {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const rawLabel = line.slice(0, idx).trim().toLowerCase();
  const label = LABELS.find((l) => l === rawLabel);
  if (!label) return null;
  return { label, value: line.slice(idx + 1).trim() };
}

function parseType(value: string): ContentWorkoutType {
  const v = value.trim().toLowerCase();
  if (v.includes('cow') || v.includes('challenge')) return 'cow';
  return 'wod';
}

function parseStatus(value: string): ContentWorkoutStatus {
  const v = value.trim().toLowerCase();
  if (v.startsWith('sched')) return 'scheduled';
  if (v.startsWith('rel')) return 'released';
  return 'draft';
}

// Accepts "YYYY-MM-DD HH:MM" (24h) or "YYYY-MM-DD H:MM AM/PM". Returns null
// (rather than throwing) on anything else, so one bad date doesn't take
// down the whole paste — the caller surfaces it as a per-entry error.
export function parseReleaseAt(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/
  );
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, meridiem] = match;
  let hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (meridiem) {
    const isPM = meridiem.toLowerCase() === 'pm';
    if (hour === 12) hour = isPM ? 12 : 0;
    else if (isPM) hour += 12;
  }
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr), hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

export type ParsedEntry =
  | { ok: true; input: ContentWorkoutInput; blockIndex: number }
  | { ok: false; blockIndex: number; name: string; error: string };

function parseBlock(block: string, blockIndex: number): ParsedEntry {
  const lines = block.split('\n').map((l) => l.replace(/\r$/, ''));
  let name = '';
  let type: ContentWorkoutType = 'wod';
  let format = '';
  let formatDescription = '';
  const movements: string[] = [];
  let videoUrl = '';
  let notes = '';
  let releaseRaw = '';
  let status: ContentWorkoutStatus = 'draft';

  let currentLabel: Label | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const matched = matchLabel(rawLine);
    if (matched) {
      currentLabel = matched.label;
      switch (matched.label) {
        case 'name':
          name = matched.value;
          break;
        case 'type':
          type = parseType(matched.value);
          break;
        case 'format':
          format = matched.value;
          break;
        case 'format description':
          formatDescription = matched.value;
          break;
        case 'movements':
          if (matched.value) movements.push(matched.value);
          break;
        case 'video':
          videoUrl = matched.value;
          break;
        case 'notes':
          notes = matched.value;
          break;
        case 'release':
          releaseRaw = matched.value;
          break;
        case 'status':
          status = parseStatus(matched.value);
          break;
      }
      continue;
    }

    // A non-label line only makes sense as a continuation of Movements —
    // every other field is single-line by design.
    if (currentLabel === 'movements') {
      movements.push(line);
    }
  }

  if (!name) {
    return { ok: false, blockIndex, name: '(untitled)', error: 'Missing a "Name:" line.' };
  }
  if (movements.length === 0) {
    return { ok: false, blockIndex, name, error: 'No movements listed under "Movements:".' };
  }
  const releaseAt = releaseRaw ? parseReleaseAt(releaseRaw) : null;
  if (releaseRaw && releaseAt === null) {
    return {
      ok: false,
      blockIndex,
      name,
      error: `Couldn't read the release date "${releaseRaw}" — use YYYY-MM-DD HH:MM.`,
    };
  }

  return {
    ok: true,
    blockIndex,
    input: {
      name,
      type,
      format,
      formatDescription,
      movements,
      videoUrl,
      notes,
      releaseAt: releaseAt ?? Date.now(),
      status,
    },
  };
}

export function parseBulkImport(text: string): ParsedEntry[] {
  const blocks = text
    .split(/\n\s*-{3,}\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  return blocks.map((block, i) => parseBlock(block, i));
}
