// SUNDAY SETUP's quote library — final and authoritative, word for word.
// Never rewrite, reword, add to, or correct any quote or attribution here;
// if the list ever needs to change, that's a deliberate content decision,
// not a copy edit.
export type SundayQuote = {
  text: string;
  attribution: string;
};

export const SUNDAY_QUOTES: SundayQuote[] = [
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', attribution: 'Will Durant' },
  { text: 'Make each day your masterpiece.', attribution: 'John Wooden' },
  {
    text: "Gold medals aren't really made of gold. They're made of sweat, determination, and a hard to find alloy called guts.",
    attribution: 'Dan Gable',
  },
  {
    text: 'My motto was always to keep swinging. Whether I was in a slump or feeling badly or having trouble off the field, the only thing to do was keep swinging.',
    attribution: 'Hank Aaron',
  },
  {
    text: "I've missed more than 9,000 shots in my career. I've lost almost 300 games. Twenty six times I've been trusted to take the game winning shot and missed. I've failed over and over and over again in my life. And that is why I succeed.",
    attribution: 'Michael Jordan',
  },
  { text: 'Enthusiasm is common. Endurance is rare.', attribution: 'Angela Duckworth' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', attribution: 'James Clear' },
  { text: 'Motivation is what gets you started. Habit is what keeps you going.', attribution: 'Jim Rohn' },
  { text: "If it doesn't challenge you, it doesn't change you.", attribution: 'Fred DeVito' },
  {
    text: "Success isn't always about greatness. It's about consistency. Consistent hard work leads to success. Greatness will come.",
    attribution: 'Dwayne Johnson',
  },
  {
    text: 'The impediment to action advances action. What stands in the way becomes the way.',
    attribution: 'Marcus Aurelius, Meditations',
  },
  {
    text: 'A champion is defined not by their wins but by how they can recover when they fall.',
    attribution: 'Serena Williams',
  },
];

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Which library index a given Sunday uses by default, counting whole weeks
// from `anchor` (the Sunday Doc's cycle currently starts counting from) and
// wrapping every 12 — negative differences (a Sunday before the anchor)
// wrap correctly too, so browsing past weeks after a restart still shows a
// sensible quote instead of an out-of-range index.
export function defaultQuoteIndexForSunday(sunday: Date, anchor: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(sunday).getTime() - startOfDay(anchor).getTime()) / dayMs);
  const diffWeeks = Math.round(diffDays / 7);
  return mod(diffWeeks, SUNDAY_QUOTES.length);
}
