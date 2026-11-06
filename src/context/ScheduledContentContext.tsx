import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { ContentCowScoringType } from './ContentLibraryContext';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

// Round 46: a genuinely server-side scheduling system for a week's 4 real
// WODs (Mon/Tue/Thu/Fri) and its one Challenge of the Week — invisible to
// every member/tier/search until release_at (Sunday 6:00pm ET, DST-correct,
// a generated column — see migration_030.sql), and released automatically
// with nobody's app open (pg_cron, same file). RLS already gates every read
// on `release_at <= now() or admin`, so there is no client-side visibility
// filter to keep in sync here — `weeks` below is simply whatever the server
// chose to hand back.
//
// This is deliberately separate from ContentLibraryContext (local-device
// localStorage) — Steady State Saturday, Sunday Setup, and any ad-hoc
// single-entry override still live there, untouched.

export type ScheduledDayOfWeek = 'mon' | 'tue' | 'thu' | 'fri';

export type ScheduledWod = {
  id: string;
  dayOfWeek: ScheduledDayOfWeek;
  name: string;
  format: string;
  formatDescription: string;
  movements: string[];
  videoUrl: string;
  notes: string;
};

// Deliberately flatter than the local Content Library's own COW shape
// (ContentWorkout's kettlebellsDudes/kettlebellsFemales split, catchIntro/
// catchPenalties/catchFollowUp split) — see migration_030.sql's own
// comment on scheduled_cows for why: the Part 4 import spec's own COW
// columns are exactly these four plain-text fields.
export type ScheduledCow = {
  id: string;
  name: string;
  videoUrl: string;
  scoringType: ContentCowScoringType;
  kettlebells?: string;
  theWork?: string;
  theCatch?: string;
  finishNote?: string;
};

export type ScheduledWeek = {
  id: string;
  weekStartDate: number; // epoch ms, local midnight Monday
  releaseAt: number;
  releasedAt: number | null;
  wods: ScheduledWod[];
  cow: ScheduledCow | null;
};

export type ScheduledWodInput = Omit<ScheduledWod, 'id'>;
export type ScheduledCowInput = Omit<ScheduledCow, 'id'>;

const DAY_OFFSET: Record<ScheduledDayOfWeek, number> = { mon: 0, tue: 1, thu: 3, fri: 4 };

// The real calendar date a scheduled WOD's day_of_week falls on, within its
// own week — a plain offset from the week's Monday, never stored itself
// (see migration_030.sql's own comment on why week_start_date is the one
// source of truth for "which days this week covers").
export function dateForScheduledDay(weekStartDate: number, day: ScheduledDayOfWeek): Date {
  const d = new Date(weekStartDate);
  d.setDate(d.getDate() + DAY_OFFSET[day]);
  return d;
}

type ScheduledWeekRow = {
  id: string;
  week_start_date: string; // 'YYYY-MM-DD'
  release_at: string;
  released_at: string | null;
  scheduled_wods: ScheduledWodRow[];
  scheduled_cows: ScheduledCowRow[];
};

type ScheduledWodRow = {
  id: string;
  day_of_week: ScheduledDayOfWeek;
  name: string;
  format: string;
  format_description: string;
  movements: string[];
  video_url: string;
  notes: string;
};

type ScheduledCowRow = {
  id: string;
  name: string;
  video_url: string;
  scoring_type: ContentCowScoringType;
  kettlebells: string | null;
  the_work: string | null;
  the_catch: string | null;
  finish_note: string | null;
};

// A plain 'YYYY-MM-DD' date column reads back as local midnight, not UTC
// midnight, to match every other weekly boundary in this app (getWeekStart
// etc., all local-device time) — parsing the three parts directly avoids
// `new Date('YYYY-MM-DD')`'s own well-known UTC-midnight parsing quirk.
function parseDateOnly(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function rowToWeek(row: ScheduledWeekRow): ScheduledWeek {
  return {
    id: row.id,
    weekStartDate: parseDateOnly(row.week_start_date),
    releaseAt: new Date(row.release_at).getTime(),
    releasedAt: row.released_at ? new Date(row.released_at).getTime() : null,
    wods: (row.scheduled_wods ?? []).map((w) => ({
      id: w.id,
      dayOfWeek: w.day_of_week,
      name: w.name,
      format: w.format,
      formatDescription: w.format_description,
      movements: w.movements ?? [],
      videoUrl: w.video_url,
      notes: w.notes,
    })),
    cow: row.scheduled_cows?.[0]
      ? {
          id: row.scheduled_cows[0].id,
          name: row.scheduled_cows[0].name,
          videoUrl: row.scheduled_cows[0].video_url,
          scoringType: row.scheduled_cows[0].scoring_type,
          kettlebells: row.scheduled_cows[0].kettlebells ?? undefined,
          theWork: row.scheduled_cows[0].the_work ?? undefined,
          theCatch: row.scheduled_cows[0].the_catch ?? undefined,
          finishNote: row.scheduled_cows[0].finish_note ?? undefined,
        }
      : null,
  };
}

const SELECT =
  'id, week_start_date, release_at, released_at, ' +
  'scheduled_wods(id, day_of_week, name, format, format_description, movements, video_url, notes), ' +
  'scheduled_cows(id, name, video_url, scoring_type, kettlebells, the_work, the_catch, finish_note)';

type ScheduledContentContextValue = {
  loading: boolean;
  error: string | null;
  // Every scheduled week this account's RLS allows it to read — released
  // weeks for everyone, plus every not-yet-released one for admin.
  weeks: ScheduledWeek[];
  // The latest week whose release_at has already passed — "the current
  // scheduled week," or null if none has been released yet (e.g. before
  // the very first scheduled week ever goes live).
  currentWeek: ScheduledWeek | null;
  // The soonest upcoming NOT-yet-released week, admin-only (RLS hides an
  // unreleased week's own content from everyone else) — used by the admin
  // warning banner. A regular member's countdown instead reads
  // nextReleaseAt below, which is deliberately content-free.
  nextWeek: ScheduledWeek | null;
  // The soonest upcoming release instant, with no content attached — comes
  // from a dedicated RPC any signed-in member can call (see
  // next_scheduled_release_at() in migration_030.sql), since an ordinary
  // member's own RLS-gated read of `weeks` never includes an unreleased
  // row at all. Null if nothing is scheduled ahead.
  nextReleaseAt: number | null;
  refetch: () => void;
  // Each week carries its own replace/skip choice — Part 4's own "importing
  // an existing week asks replace or skip, PER WEEK" requirement, never one
  // global choice for the whole import.
  importWeeks: (
    weeks: { weekStartDate: number; wods: ScheduledWodInput[]; cow: ScheduledCowInput | null; mode: 'replace' | 'skip' }[]
  ) => Promise<void>;
  updateWod: (wodId: string, input: Partial<ScheduledWodInput>) => Promise<void>;
  addWod: (weekId: string, input: ScheduledWodInput) => Promise<void>;
  removeWod: (wodId: string) => Promise<void>;
  updateCow: (weekId: string, input: Partial<ScheduledCowInput>) => Promise<void>;
  deleteWeek: (weekId: string) => Promise<void>;
};

const ScheduledContentContext = createContext<ScheduledContentContextValue | undefined>(undefined);

function toDateOnlyString(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ScheduledContentProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [weeks, setWeeks] = useState<ScheduledWeek[]>([]);
  const [nextReleaseAt, setNextReleaseAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('scheduled_weeks').select(SELECT).order('week_start_date', { ascending: true }),
      supabase.rpc('next_scheduled_release_at'),
    ]).then(([weeksRes, nextRes]) => {
      if (cancelled) return;
      if (weeksRes.error) {
        setError(isBackendUnavailableError(weeksRes.error) ? "Can't load the schedule right now." : weeksRes.error.message);
        setLoading(false);
        return;
      }
      setWeeks(((weeksRes.data as unknown as ScheduledWeekRow[]) ?? []).map(rowToWeek));
      setNextReleaseAt(nextRes.data ? new Date(nextRes.data as string).getTime() : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, user, refetchTick]);

  const refetch = () => setRefetchTick((t) => t + 1);

  const now = Date.now();
  const released = weeks.filter((w) => w.releaseAt <= now);
  const currentWeek = released.length > 0 ? released[released.length - 1] : null;
  const unreleased = weeks.filter((w) => w.releaseAt > now);
  const nextWeek = unreleased.length > 0 ? unreleased[0] : null;

  const value = useMemo<ScheduledContentContextValue>(
    () => ({
      loading,
      error,
      weeks,
      currentWeek,
      nextWeek,
      nextReleaseAt: nextReleaseAt && nextReleaseAt > Date.now() ? nextReleaseAt : null,
      refetch,
      importWeeks: async (importedWeeks) => {
        for (const w of importedWeeks) {
          const dateStr = toDateOnlyString(w.weekStartDate);
          const { data: existing } = await supabase
            .from('scheduled_weeks')
            .select('id')
            .eq('week_start_date', dateStr)
            .maybeSingle();

          let weekId: string;
          if (existing) {
            if (w.mode === 'skip') continue;
            weekId = (existing as { id: string }).id;
            await supabase.from('scheduled_wods').delete().eq('week_id', weekId);
            await supabase.from('scheduled_cows').delete().eq('week_id', weekId);
          } else {
            const { data: created, error: createErr } = await supabase
              .from('scheduled_weeks')
              .insert({ week_start_date: dateStr })
              .select('id')
              .single();
            if (createErr || !created) throw createErr ?? new Error('Could not create scheduled week.');
            weekId = (created as { id: string }).id;
          }

          if (w.wods.length > 0) {
            await supabase.from('scheduled_wods').insert(
              w.wods.map((wod) => ({
                week_id: weekId,
                day_of_week: wod.dayOfWeek,
                name: wod.name,
                format: wod.format,
                format_description: wod.formatDescription,
                movements: wod.movements,
                video_url: wod.videoUrl,
                notes: wod.notes,
              }))
            );
          }
          if (w.cow) {
            await supabase.from('scheduled_cows').insert({
              week_id: weekId,
              name: w.cow.name,
              video_url: w.cow.videoUrl,
              scoring_type: w.cow.scoringType,
              kettlebells: w.cow.kettlebells ?? null,
              the_work: w.cow.theWork ?? null,
              the_catch: w.cow.theCatch ?? null,
              finish_note: w.cow.finishNote ?? null,
            });
          }
        }
        refetch();
      },
      updateWod: async (wodId, input) => {
        const patch: Record<string, unknown> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.format !== undefined) patch.format = input.format;
        if (input.formatDescription !== undefined) patch.format_description = input.formatDescription;
        if (input.movements !== undefined) patch.movements = input.movements;
        if (input.videoUrl !== undefined) patch.video_url = input.videoUrl;
        if (input.notes !== undefined) patch.notes = input.notes;
        if (input.dayOfWeek !== undefined) patch.day_of_week = input.dayOfWeek;
        const { error: err } = await supabase.from('scheduled_wods').update(patch).eq('id', wodId);
        if (err) throw err;
        refetch();
      },
      addWod: async (weekId, input) => {
        const { error: err } = await supabase.from('scheduled_wods').insert({
          week_id: weekId,
          day_of_week: input.dayOfWeek,
          name: input.name,
          format: input.format,
          format_description: input.formatDescription,
          movements: input.movements,
          video_url: input.videoUrl,
          notes: input.notes,
        });
        if (err) throw err;
        refetch();
      },
      removeWod: async (wodId) => {
        const { error: err } = await supabase.from('scheduled_wods').delete().eq('id', wodId);
        if (err) throw err;
        refetch();
      },
      updateCow: async (weekId, input) => {
        const existing = weeks.find((w) => w.id === weekId)?.cow;
        const patch: Record<string, unknown> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.videoUrl !== undefined) patch.video_url = input.videoUrl;
        if (input.scoringType !== undefined) patch.scoring_type = input.scoringType;
        if (input.kettlebells !== undefined) patch.kettlebells = input.kettlebells ?? null;
        if (input.theWork !== undefined) patch.the_work = input.theWork ?? null;
        if (input.theCatch !== undefined) patch.the_catch = input.theCatch ?? null;
        if (input.finishNote !== undefined) patch.finish_note = input.finishNote ?? null;

        if (existing) {
          const { error: err } = await supabase.from('scheduled_cows').update(patch).eq('id', existing.id);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from('scheduled_cows').insert({ week_id: weekId, ...patch });
          if (err) throw err;
        }
        refetch();
      },
      deleteWeek: async (weekId) => {
        const { error: err } = await supabase.from('scheduled_weeks').delete().eq('id', weekId);
        if (err) throw err;
        refetch();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, error, weeks, nextReleaseAt, currentWeek, nextWeek]
  );

  return <ScheduledContentContext.Provider value={value}>{children}</ScheduledContentContext.Provider>;
}

export function useScheduledContent() {
  const ctx = useContext(ScheduledContentContext);
  if (!ctx) {
    throw new Error('useScheduledContent must be used within a ScheduledContentProvider');
  }
  return ctx;
}

// The scheduled week (if any) covering the calendar week containing `date` —
// compares Monday-to-Monday, local-device time, same convention as
// data/content.ts's own getWeekStart. Only ever a CURRENT or past-released
// week in practice (members never navigate to another week in this app),
// but written generally so DocsWodsScreen/DayPanel (both always showing
// "this week") get the right answer without assuming which week that is.
export function useScheduledWeekFor(date: Date): ScheduledWeek | null {
  const { weeks } = useScheduledContent();
  const now = Date.now();
  const monday = new Date(date);
  const jsDay = monday.getDay();
  monday.setDate(monday.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  monday.setHours(0, 0, 0, 0);
  const target = monday.getTime();
  return weeks.find((w) => w.releaseAt <= now && w.weekStartDate === target) ?? null;
}
