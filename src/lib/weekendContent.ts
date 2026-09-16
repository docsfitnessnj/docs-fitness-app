import { ContentWorkout, ContentWorkoutType, useContentLibrary } from '../context/ContentLibraryContext';
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

export function useSundaySetup(date: Date): SundaySetupContent {
  const { workouts, quoteCycleAnchor } = useContentLibrary();
  const entry = findPublishedFor(workouts, 'sunday_setup', date);
  const quoteIndex = entry?.quoteOverrideIndex ?? defaultQuoteIndexForSunday(date, new Date(quoteCycleAnchor));
  return {
    prepFocus: entry?.formatDescription.trim() ? entry.formatDescription.trim() : null,
    quote: SUNDAY_QUOTES[quoteIndex],
  };
}
