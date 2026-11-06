import { ContentWorkout, ContentWorkoutType, useContentLibrary } from '../context/ContentLibraryContext';
import { useMembership } from '../context/MembershipContext';
import { useProfile } from '../context/ProfileContext';
import { ScheduledDayOfWeek, ScheduledWeek, useScheduledContent } from '../context/ScheduledContentContext';
import { DayWod, getWeekStart, isFutureDay, WeekDay } from '../data/content';
import { defaultQuoteIndexForSunday, SUNDAY_QUOTES, SundayQuote } from '../data/sundayQuotes';

export type SteadyStateSaturdayContent = {
  title: string;
  description: string;
  movements: string[];
  videoUrl: string;
};

export type SundaySetupContent = {
  // null means Doc hasn't written this week's prep focus yet — render the
  // fixed name with a quiet "Coming this week" line, never placeholder text.
  prepFocus: string | null;
  quote: SundayQuote;
};

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// The one published entry of `type` whose release date lands on this exact
// calendar day, if any — matched by day, not "most recently published,"
// since Steady State Saturday and Sunday Setup are each tied to one
// specific date a week, unlike the rolling Weekly Challenge.
function findPublishedFor(workouts: ContentWorkout[], type: ContentWorkoutType, date: Date): ContentWorkout | null {
  return workouts.find((w) => w.type === type && w.status === 'published' && isSameCalendarDay(new Date(w.releaseAt), date)) ?? null;
}

export function useSteadyStateSaturday(date: Date): SteadyStateSaturdayContent | null {
  const { workouts } = useContentLibrary();
  const entry = findPublishedFor(workouts, 'steady_state', date);
  if (!entry) return null;
  return {
    title: entry.name,
    description: entry.formatDescription,
    movements: entry.movements,
    videoUrl: entry.videoUrl,
  };
}

// Does a real, released Round 46 scheduled week cover the calendar week
// `day` falls in? A plain function, not a hook — DateStrip needs this
// computed once per cell of a 7-day week inside a loop (DocsWodsScreen/
// CommunityScreen), which a hook can't be called inside without violating
// the rules of hooks; both useWeekdayWod and useIsCowDay below also share
// this same check against whichever single `currentWeek` their own caller
// already fetched once via useScheduledContent().
export function coveringScheduledWeek(day: WeekDay, currentWeek: ScheduledWeek | null): ScheduledWeek | null {
  if (!currentWeek) return null;
  return currentWeek.weekStartDate === getWeekStart(day.date).getTime() ? currentWeek : null;
}

// Plain, non-hook version of useIsCowDay — for a caller (DateStrip's own
// per-cell loop) that already has `currentWeek` in hand and can't call a
// hook per cell.
export function isCowDayFor(day: WeekDay, currentWeek: ScheduledWeek | null): boolean {
  return !!day.wod && day.wod.key === 'wed' && !!coveringScheduledWeek(day, currentWeek);
}

// A weekday's real WOD, as shown to members. Priority order: (1) a real,
// released Round 46 scheduled week covering this calendar week — the new
// server-side system, Mon/Tue/Thu/Fri only; Wednesday returns undefined
// here even though `day.wod` (the legacy fallback) still has one, since a
// covered week's Wednesday is COW day now (see useIsCowDay) — (2) Doc's
// admin-published local Content Library entry for this exact calendar date
// (the pre-existing single-entry override, still fully live for any week
// the new system hasn't covered), otherwise (3) the standing default from
// WEEKDAY_WODS. Per the brief: "the 4-WOD shape applies to scheduled weeks
// going forward only" — a week with no real scheduled-system coverage is
// completely unaffected, still 5 real WOD days exactly as before.
export function useWeekdayWod(day: WeekDay): DayWod | undefined {
  const { workouts } = useContentLibrary();
  const { currentWeek } = useScheduledContent();
  if (!day.wod) return undefined;

  const scheduled = coveringScheduledWeek(day, currentWeek);
  if (scheduled) {
    if (day.wod.key === 'wed') return undefined;
    const match = scheduled.wods.find((w) => w.dayOfWeek === (day.wod!.key as ScheduledDayOfWeek));
    if (match) {
      return {
        key: day.wod.key,
        title: match.name,
        moves: match.movements,
        videoUrl: match.videoUrl || undefined,
      };
    }
  }

  const override = findPublishedFor(workouts, 'wod', day.date);
  if (!override) return day.wod;
  return {
    key: day.wod.key,
    title: override.name,
    moves: override.movements,
    videoUrl: override.videoUrl || undefined,
  };
}

// True only for Wednesday, only when a real released scheduled week covers
// this calendar week — the signal DocsWodsScreen/DayPanel use to render
// "this is COW day, go post your score" instead of the legacy "Rest day."
export function useIsCowDay(day: WeekDay): boolean {
  const { currentWeek } = useScheduledContent();
  return isCowDayFor(day, currentWeek);
}

// Whether Monthly Unlimited's SHOW TOMORROW'S WORKOUT preference is
// currently hiding this specific day's workout — only ever true for a day
// after today (today's own workout always shows) and only for a member on
// the in_person_unlimited tier who has turned the preference off. Every
// other tier sees no change at all.
export function useTomorrowsWorkoutHidden(day: WeekDay): boolean {
  const { tier } = useMembership();
  const { showTomorrowsWorkout } = useProfile();
  return tier === 'in_person_unlimited' && !showTomorrowsWorkout && isFutureDay(day);
}

export function useSundaySetup(date: Date): SundaySetupContent {
  const { workouts, quoteCycleAnchor } = useContentLibrary();
  const entry = findPublishedFor(workouts, 'sunday_setup', date);
  const quoteIndex = entry?.quoteOverrideIndex ?? defaultQuoteIndexForSunday(date, new Date(quoteCycleAnchor));
  return {
    prepFocus: entry?.formatDescription.trim() ? entry.formatDescription.trim() : null,
    quote: SUNDAY_QUOTES[quoteIndex],
  };
}
