import { ContentWorkout, ContentWorkoutType, useContentLibrary } from '../context/ContentLibraryContext';
import { useMembership } from '../context/MembershipContext';
import { useProfile } from '../context/ProfileContext';
import { DayWod, isFutureDay, WeekDay } from '../data/content';
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

// A weekday's real WOD, as shown to members — Doc's admin-published entry
// for this exact calendar date if she's set one (title, movements, and
// crucially its own videoUrl), otherwise the standing default from
// WEEKDAY_WODS. This is what actually makes a WOD's own WATCH VIDEO
// BREAKDOWN button possible: without this override, nothing Doc enters in
// the Content Library for a "DOC'S WOD" entry ever reaches this screen,
// since WEEKDAY_WODS has no video field a real video could ever land in.
export function useWeekdayWod(day: WeekDay): DayWod | undefined {
  const { workouts } = useContentLibrary();
  if (!day.wod) return undefined;
  const override = findPublishedFor(workouts, 'wod', day.date);
  if (!override) return day.wod;
  return {
    key: day.wod.key,
    title: override.name,
    moves: override.movements,
    videoUrl: override.videoUrl || undefined,
  };
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
